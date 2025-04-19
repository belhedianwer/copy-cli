/**
 * Timestamp Plugin for copy-cli
 *
 * This simple plugin demonstrates:
 * 1. Exporting an `install` function.
 * 2. Accessing the context object (`logger`, `i18n`, `argv`).
 * 3. Logging messages using the provided logger.
 * 4. Using `i18n` within the plugin.
 * 5. Adding a process exit hook (for cleanup or final messages).
 */

// Use ES Module export syntax
export async function install({ logger, i18n, argv }) {

    // --- Code executed when the plugin is loaded ---

    // Get the current timestamp
    const startTime = new Date();

    // Log a message using the logger provided by the core script
    // Use i18n for translatable messages. Remember to add this key to your locale files!
    logger.info(`[TimestampPlugin] ${i18n.__('Plugin initialized at %s', startTime.toLocaleTimeString())}`);

    // Example of accessing arguments passed to the main script
    if (argv['dry-run']) {
        logger.info(`[TimestampPlugin] ${i18n.__('Dry run mode detected by plugin.')}`);
    }

    // --- Optional: Add actions on script exit ---

    // This demonstrates how a plugin could perform cleanup or final logging.
    // Note: This runs *after* the main copy logic is complete OR if the process exits early.
    // It won't run if the process crashes hard.
    process.on('exit', (code) => {
        const endTime = new Date();
        const duration = (endTime - startTime) / 1000; // Duration in seconds

        // Log a final message. Remember to add this key to your locale files!
        // We use console.log here because the logger might already be closed on 'exit'
        // in some scenarios, especially during errors.
        console.log(
            `[TimestampPlugin] ${i18n.__('Plugin exiting. Code: %s, Duration: %s sec', code, duration.toFixed(2))}`
        );
    });

    // The install function can be async if needed (e.g., for setup tasks)
    // await someAsyncSetup();
}

// You could also use `export default { install };` if you prefer.
