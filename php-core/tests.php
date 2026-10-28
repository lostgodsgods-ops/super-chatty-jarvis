<?php
declare(strict_types=1);
require_once __DIR__ . '/index.php';
function expect(bool $condition, string $message): void {
    if (!$condition) { fwrite(STDERR, "FAIL: {$message}\n"); exit(1); }
}
function call_api(string $method, string $path, array $headers = [], string $body = '', string $secret = 'test-secret-with-at-least-32-characters'): array {
    return redultron_handle_request($method, $path, $headers, $body, $secret);
}
$health = call_api('GET', '/health');
expect($health['status'] === 200 && ($health['body']['ok'] ?? false) === true, 'health endpoint returns minimal success');
$missing = call_api('POST', '/v1/execute', ['content-type' => 'application/json'], '{"task":"summarize","text":"One. Two."}');
expect($missing['status'] === 401 && $missing['body']['code'] === 'OWNER_AUTH_REQUIRED', 'missing owner secret is rejected');
$badSecret = call_api('POST', '/v1/execute', ['x-owner-secret' => 'wrong-secret', 'content-type' => 'application/json'], '{"task":"summarize","text":"One. Two."}');
expect($badSecret['status'] === 401, 'invalid owner secret is rejected without detail');
$valid = call_api('POST', '/v1/execute', ['x-owner-secret' => 'test-secret-with-at-least-32-characters', 'content-type' => 'application/json'], '{"task":"summarize","text":"One. Two. Three. Four."}');
expect($valid['status'] === 200 && $valid['body']['result'] === 'One. Two. Three.', 'summarize task is bounded and deterministic');
$unknownTask = call_api('POST', '/v1/execute', ['x-owner-secret' => 'test-secret-with-at-least-32-characters', 'content-type' => 'application/json'], '{"task":"unknown_task","text":"hello"}');
expect($unknownTask['status'] === 400 && $unknownTask['body']['code'] === 'HYBRID_TASK_NOT_ALLOWED', 'unknown tasks are denied');
$wrongType = call_api('POST', '/v1/execute', ['x-owner-secret' => 'test-secret-with-at-least-32-characters', 'content-type' => 'text/plain'], '{}');
expect($wrongType['status'] === 415, 'non-JSON content type is rejected');
$tooLarge = call_api('POST', '/v1/execute', ['x-owner-secret' => 'test-secret-with-at-least-32-characters', 'content-type' => 'application/json'], str_repeat('x', 10241));
expect($tooLarge['status'] === 413, 'oversized request body is rejected');
$malformed = call_api('POST', '/v1/execute', ['x-owner-secret' => 'test-secret-with-at-least-32-characters', 'content-type' => 'application/json'], '{');
expect($malformed['status'] === 400 && $malformed['body']['code'] === 'INVALID_JSON', 'malformed JSON is rejected');
$unknownRoute = call_api('GET', '/internal/debug');
expect($unknownRoute['status'] === 404, 'unknown route is not exposed');
$unconfigured = call_api('POST', '/v1/execute', ['content-type' => 'application/json'], '{}', 'short');
expect($unconfigured['status'] === 503 && $unconfigured['body']['code'] === 'SERVER_AUTH_NOT_CONFIGURED', 'misconfigured server fails closed');
fwrite(STDOUT, "PASS: 10 PHP Core contract checks\n");
