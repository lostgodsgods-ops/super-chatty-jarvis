import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * REDULTRON local command master.
 *
 * Delegates only to the repository's allowlisted Python CLI adapter.
 * This is not a replacement for the authenticated Worker/Render boundary.
 */
public final class RedultronCoreMaster {
    private static final int MAX_COMMAND_CHARS = 10_000;
    private static final int MAX_OUTPUT_CHARS = 1_000_000;
    private static final long DEFAULT_TIMEOUT_SECONDS = 60;
    private static final long MAX_TIMEOUT_SECONDS = 120;

    private RedultronCoreMaster() {}

    public static void main(String[] args) {
        int exitCode = run(args);
        if (exitCode != 0) {
            System.exit(exitCode);
        }
    }

    static int run(String[] args) {
        if (args == null || args.length == 0) {
            System.out.println("[REDULTRON MASTER]: Awaiting Command...");
            return 0;
        }

        String command = String.join(" ", args).trim();
        if (command.isEmpty() || command.length() > MAX_COMMAND_CHARS) {
            System.err.println("[REJECTED]: Invalid command.");
            return 2;
        }

        Path script = Path.of(
            System.getProperty("user.dir"),
            "hybrid-core",
            "redultron_brain.py"
        ).toAbsolutePath().normalize();

        if (!Files.isRegularFile(script)) {
            System.err.println("[BLOCKED]: Python Brain not found.");
            return 3;
        }

        String python = System.getenv().getOrDefault("REDULTRON_PYTHON", "python3");
        if (python.isBlank() || python.indexOf('\n') >= 0 || python.indexOf('\r') >= 0) {
            System.err.println("[BLOCKED]: Invalid Python executable configuration.");
            return 3;
        }

        long timeoutSeconds = configuredTimeoutSeconds();
        ExecutorService readers = Executors.newFixedThreadPool(2);
        Process process = null;

        try {
            System.out.println("[REDULTRON MASTER]: Processing via bounded Python Core...");

            List<String> invocation = new ArrayList<>();
            invocation.add(python);
            invocation.add(script.toString());
            invocation.add(command);

            ProcessBuilder builder = new ProcessBuilder(invocation);
            builder.directory(script.getParent().toFile());
            process = builder.start();

            final Process running = process;
            Future<String> stdout = readers.submit(
                () -> readBounded(running.getInputStream(), MAX_OUTPUT_CHARS)
            );
            Future<String> stderr = readers.submit(
                () -> readBounded(running.getErrorStream(), MAX_OUTPUT_CHARS)
            );

            if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                process.destroy();
                if (!process.waitFor(2, TimeUnit.SECONDS)) {
                    process.destroyForcibly();
                    process.waitFor(2, TimeUnit.SECONDS);
                }
                System.err.println("[TIMEOUT]: Python Core exceeded execution limit.");
                return 124;
            }

            String output = getReaderResult(stdout);
            String errors = getReaderResult(stderr);
            int exitCode = process.exitValue();

            System.out.println("=== REDULTRON CORE EXECUTION RESULT ===");
            if (!output.isBlank()) {
                System.out.print(output);
                if (!output.endsWith("\n")) {
                    System.out.println();
                }
            }

            if (!errors.isBlank()) {
                // Python adapter is expected to emit sanitized diagnostics only.
                System.err.println("=== PYTHON CORE DIAGNOSTICS ===");
                System.err.print(errors);
                if (!errors.endsWith("\n")) {
                    System.err.println();
                }
            }

            System.out.println("[EXIT CODE]: " + exitCode);
            System.out.println("[CORE STATUS]: " + (exitCode == 0 ? "COMPLETED" : "FAIL"));
            return exitCode;

        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            if (process != null) {
                process.destroyForcibly();
            }
            System.err.println("[INTERRUPTED]: Execution cancelled.");
            return 130;

        } catch (IOException | ExecutionException | TimeoutException exception) {
            if (process != null) {
                process.destroyForcibly();
            }
            System.err.println("[CRITICAL EXCEPTION]: Python Core execution failed.");
            return 1;

        } finally {
            readers.shutdownNow();
        }
    }

    private static long configuredTimeoutSeconds() {
        String configured = System.getenv("REDULTRON_TIMEOUT_SECONDS");
        if (configured == null || configured.isBlank()) {
            return DEFAULT_TIMEOUT_SECONDS;
        }
        try {
            long value = Long.parseLong(configured);
            if (value < 1 || value > MAX_TIMEOUT_SECONDS) {
                return DEFAULT_TIMEOUT_SECONDS;
            }
            return value;
        } catch (NumberFormatException exception) {
            return DEFAULT_TIMEOUT_SECONDS;
        }
    }

    private static String getReaderResult(Future<String> future)
            throws InterruptedException, ExecutionException, TimeoutException {
        return future.get(5, TimeUnit.SECONDS);
    }

    /**
     * Retain only a bounded prefix, but continue draining the pipe to EOF so a
     * verbose child process cannot block forever on a full OS pipe buffer.
     */
    private static String readBounded(InputStream stream, int maxChars)
            throws IOException {
        StringBuilder output = new StringBuilder(Math.min(maxChars, 8192));
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            char[] buffer = new char[4096];
            int count;
            boolean truncated = false;
            while ((count = reader.read(buffer)) != -1) {
                int remaining = maxChars - output.length();
                if (remaining > 0) {
                    output.append(buffer, 0, Math.min(count, remaining));
                }
                if (count > remaining) {
                    truncated = true;
                }
            }
            if (truncated) {
                output.append("\n[OUTPUT TRUNCATED]");
            }
        }
        return output.toString();
    }
}
