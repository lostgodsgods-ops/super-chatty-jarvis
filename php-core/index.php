<?php
declare(strict_types=1);

/**
 * REDULTRON PHP Core: bounded, allowlisted processing sidecar.
 * Deploy behind HTTPS ingress. Never log request bodies or authentication headers.
 */
const REDULTRON_MAX_BODY_BYTES = 10240;
const REDULTRON_MAX_TEXT_CHARS = 16000;
const REDULTRON_ALLOWED_TASKS = ['summarize', 'extract_keywords', 'classify_text'];

function redultron_response(int $status, array $body, string $requestId): array {
    return [
        'status' => $status,
        'body' => $body,
        'headers' => [
            'Content-Type' => 'application/json; charset=utf-8',
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
            'Referrer-Policy' => 'no-referrer',
            'X-Request-ID' => $requestId,
        ],
    ];
}

function redultron_header(array $headers, string $name): string {
    foreach ($headers as $key => $value) {
        if (strtolower((string)$key) === strtolower($name) && is_string($value)) {
            return trim($value);
        }
    }
    return '';
}

function redultron_process_task(mixed $task, mixed $text): mixed {
    if (!is_string($task) || !in_array($task, REDULTRON_ALLOWED_TASKS, true)) {
        throw new DomainException('HYBRID_TASK_NOT_ALLOWED');
    }
    if (!is_string($text) || trim($text) === '' || mb_strlen($text, 'UTF-8') > REDULTRON_MAX_TEXT_CHARS) {
        throw new DomainException('HYBRID_TEXT_LENGTH_INVALID');
    }

    $normalized = preg_replace('/\s+/u', ' ', trim($text));
    if (!is_string($normalized)) {
        throw new DomainException('HYBRID_TEXT_INVALID');
    }

    if ($task === 'summarize') {
        preg_match_all('/.*?(?:[.!?]+(?=\s|$)|$)/u', $normalized, $matches);
        $sentences = array_values(array_filter(array_map('trim', $matches[0]), static fn($s) => $s !== ''));
        return mb_substr(implode(' ', array_slice($sentences, 0, 3)), 0, 2000, 'UTF-8');
    }

    if ($task === 'extract_keywords') {
        preg_match_all("/[A-Za-z][A-Za-z0-9'-]{2,}/", strtolower($normalized), $matches);
        $stop = ['the', 'and', 'for', 'that', 'with', 'this', 'from', 'are', 'was', 'were', 'have', 'has'];
        $counts = [];
        foreach ($matches[0] as $word) {
            if (!in_array($word, $stop, true)) {
                $counts[$word] = ($counts[$word] ?? 0) + 1;
            }
        }
        arsort($counts);
        $result = [];
        foreach (array_slice($counts, 0, 12, true) as $term => $count) {
            $result[] = ['term' => $term, 'count' => $count];
        }
        return $result;
    }

    $lower = strtolower($normalized);
    $labels = [];
    foreach (['error', 'failed', 'exception', 'timeout', 'bug'] as $term) {
        if (str_contains($lower, $term)) {
            $labels[] = 'technical_issue';
            break;
        }
    }
    foreach (['news', 'today', 'headline', 'breaking'] as $term) {
        if (str_contains($lower, $term)) {
            $labels[] = 'current_information';
            break;
        }
    }
    if ($labels === []) {
        $labels[] = 'general';
    }
    return ['labels' => $labels, 'characters' => mb_strlen($normalized, 'UTF-8')];
}

function redultron_handle_request(string $method, string $path, array $headers, string $rawBody, string $expectedSecret): array {
    $candidateId = redultron_header($headers, 'X-Request-ID');
    $requestId = preg_match('/^[A-Za-z0-9._:-]{8,64}$/', $candidateId) === 1
        ? $candidateId
        : bin2hex(random_bytes(8));
    $route = parse_url($path, PHP_URL_PATH);
    $route = is_string($route) ? $route : '/';

    if ($method === 'GET' && $route === '/health') {
        return redultron_response(200, ['ok' => true, 'service' => 'redultron-php-core'], $requestId);
    }
    if ($method !== 'POST' || $route !== '/v1/execute') {
        return redultron_response(404, ['ok' => false, 'code' => 'NOT_FOUND'], $requestId);
    }

    if (strlen($expectedSecret) < 32) {
        return redultron_response(503, ['ok' => false, 'code' => 'SERVER_AUTH_NOT_CONFIGURED'], $requestId);
    }
    $suppliedSecret = redultron_header($headers, 'X-Owner-Secret');
    if ($suppliedSecret === '' || !hash_equals($expectedSecret, $suppliedSecret)) {
        return redultron_response(401, ['ok' => false, 'code' => 'OWNER_AUTH_REQUIRED'], $requestId);
    }

    $contentType = strtolower(trim(explode(';', redultron_header($headers, 'Content-Type'))[0]));
    if ($contentType !== 'application/json') {
        return redultron_response(415, ['ok' => false, 'code' => 'UNSUPPORTED_MEDIA_TYPE'], $requestId);
    }
    $declaredLength = redultron_header($headers, 'Content-Length');
    if ($declaredLength !== '' && (!ctype_digit($declaredLength) || (int)$declaredLength !== strlen($rawBody))) {
        return redultron_response(400, ['ok' => false, 'code' => 'INVALID_REQUEST_FRAMING'], $requestId);
    }
    if (strlen($rawBody) < 1) {
        return redultron_response(400, ['ok' => false, 'code' => 'INVALID_CONTENT_LENGTH'], $requestId);
    }
    if (strlen($rawBody) > REDULTRON_MAX_BODY_BYTES) {
        return redultron_response(413, ['ok' => false, 'code' => 'REQUEST_TOO_LARGE'], $requestId);
    }

    try {
        $decoded = json_decode($rawBody, false, 16, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        return redultron_response(400, ['ok' => false, 'code' => 'INVALID_JSON'], $requestId);
    }
    if (!$decoded instanceof stdClass || array_diff(array_keys(get_object_vars($decoded)), ['task', 'text']) !== []
        || count(get_object_vars($decoded)) !== 2) {
        return redultron_response(400, ['ok' => false, 'code' => 'INVALID_REQUEST_FIELDS'], $requestId);
    }

    try {
        $result = redultron_process_task($decoded->task ?? null, $decoded->text ?? null);
    } catch (DomainException $exception) {
        $code = in_array($exception->getMessage(), ['HYBRID_TASK_NOT_ALLOWED', 'HYBRID_TEXT_LENGTH_INVALID', 'HYBRID_TEXT_INVALID'], true)
            ? $exception->getMessage() : 'INVALID_REQUEST';
        return redultron_response(400, ['ok' => false, 'code' => $code], $requestId);
    }

    return redultron_response(200, ['ok' => true, 'task' => $decoded->task, 'result' => $result], $requestId);
}

function redultron_serve(): never {
    $startedAt = microtime(true);
    $expectedSecret = getenv('OWNER_SECRET') ?: '';
    if (strlen($expectedSecret) < 32) {
        error_log('REDULTRON_PHP_CORE_STARTUP_BLOCKED code=OWNER_SECRET_NOT_CONFIGURED');
        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode(['ok' => false, 'code' => 'SERVER_AUTH_NOT_CONFIGURED']);
        exit;
    }

    $headers = function_exists('getallheaders') ? getallheaders() : [];
    if (!is_array($headers)) {
        $headers = [];
    }
    $body = file_get_contents('php://input', false, null, 0, REDULTRON_MAX_BODY_BYTES + 1);
    if (!is_string($body)) {
        $body = '';
    }
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $path = $_SERVER['REQUEST_URI'] ?? '/';
    $response = redultron_handle_request($method, $path, $headers, $body, $expectedSecret);

    http_response_code($response['status']);
    foreach ($response['headers'] as $name => $value) {
        header($name . ': ' . $value);
    }
    echo json_encode($response['body'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $event = [
        'request_id' => $response['headers']['X-Request-ID'],
        'status' => $response['status'],
        'latency_ms' => max(0, (int)((microtime(true) - $startedAt) * 1000)),
    ];
    if (isset($response['body']['code'])) {
        $event['event_code'] = $response['body']['code'];
    }
    error_log('REDULTRON_PHP_CORE ' . json_encode($event, JSON_UNESCAPED_SLASHES));
}

if (PHP_SAPI !== 'cli') {
    redultron_serve();
}
