#!/usr/bin/env node
/**
 * copy-cli: Interactive file copier with config, plugins, i18n, logs & more.
 * (c) 2025 Anwer Awled Belhedi — MIT License
 */

// All imports remain the same...
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import fsSync from 'fs';
import fg from 'fast-glob';
import pLimit from 'p-limit';
import cliProgress from 'cli-progress';
import ora from 'ora';
import chalk from 'chalk';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import updateNotifier from 'update-notifier';
import winston from 'winston';
import i18n from 'i18n';
import { input, confirm, select } from '@inquirer/prompts';

// --- Determine base directory for relative paths ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load environment variables
dotenv.config();

// 2. Check for updates (before heavy logic)
let pkg = { version: '0.0.0' }; // Default pkg info
try {
    const pkgPath = new URL('./package.json', import.meta.url);
    pkg = JSON.parse(await fs.readFile(pkgPath));
    updateNotifier({ pkg }).notify();
} catch (e) {
    console.error(chalk.yellow("Warning: Could not read package.json for update check."), e.message);
}


// 3. i18n configuration
const localesDir = path.join(__dirname, 'locales');
const supportedLocales = ['en', 'fr', 'es', 'ar'];
i18n.configure({
  locales: supportedLocales,
  defaultLocale: 'en',
  directory: localesDir,
  objectNotation: true, // Use dot notation in keys if needed, but simple strings are safer here
  updateFiles: false     // Explicitly disable auto-updating locale files
});

// --- PRE-PARSE for language, help, version flags ---
// Temporarily set locale for initial parsing/help
i18n.setLocale(process.env.LANG?.split(/[._]/)[0] || 'en');
const preliminaryArgv = yargs(hideBin(process.argv))
    .option('lang', { type: 'string', hidden: true }) // For lang detection
    .option('help', { alias: 'h', type: 'boolean', hidden: true }) // For help detection
    .option('detectVersion', { // Use non-reserved key for version flag detection
        alias: 'V',           // Keep the -V alias
        type: 'boolean',
        hidden: true          // Hide this internal option
    })
    .help(false)              // Disable default help handler for pre-parse
    .version(false)           // IMPORTANT: Disable default version handler for pre-parse
    .parseSync();             // Use synchronous parse for this simple check

// --- Language Selection ---
let chosenLang = preliminaryArgv.lang; // Get lang from pre-parsed args if provided

// Function to prompt for language if needed
async function promptForLanguage() {
    if (!process.stdout.isTTY) {
        // If not in an interactive terminal, just use the default
        return i18n.getLocale();
    }
     try {
        console.log(chalk.blue('Welcome to copy-cli! Please choose your language:'));
        return await select({
            message: 'Select language / Choisissez la langue / Seleccione el idioma / اختر اللغة:', // Multi-lang prompt
            choices: [ // Define language choices clearly
                { name: 'English', value: 'en', description: 'Default language' },
                { name: 'Français', value: 'fr', description: 'French language' },
                { name: 'Español', value: 'es', description: 'Spanish language' },
                { name: 'العربية', value: 'ar', description: 'Arabic language' },
            ],
            default: i18n.getLocale(), // Default to current locale setting
        });
    } catch (promptError) {
        // Handle cancellation (e.g., Ctrl+C) gracefully
        console.error(chalk.red("\nLanguage selection cancelled or failed."), promptError.message);
        process.exit(1); // Exit if language selection is aborted
    }
}

// Determine the final language to use
// Prompt only if --lang was not given AND neither --help nor --detectVersion/-V was used
if (!chosenLang && !preliminaryArgv.help && !preliminaryArgv.detectVersion) {
    chosenLang = await promptForLanguage();
} else if (!chosenLang) {
    // If --lang was omitted but --help or --detectVersion/-V was used, use default
    chosenLang = i18n.getLocale();
}

// Set the final locale for i18n (used for all subsequent translations)
i18n.setLocale(chosenLang);

// 4. Winston logger configuration (now uses chosen language for potential future log messages)
const logsDir = path.join(__dirname, 'logs');
try {
    await fs.mkdir(logsDir, { recursive: true }); // Ensure log directory exists
} catch (mkdirError) {
    console.error(chalk.red(`Critical Error: Could not create log directory '${logsDir}':`), mkdirError);
    // Potentially exit if logging is critical, or continue with console logging only
}
// Configure logger transports (File logs always active, Console is silent by default)
const loggerTransports = [
    new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error' // Log only errors to this file
    }),
    new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        level: 'info' // Log info and above to this file
    }),
    new winston.transports.Console({ // Console transport, configured later based on --log-level
        level: 'info', // Default level *if* activated
        silent: true,  // Start silent
        format: winston.format.combine(
            winston.format.colorize(), // Add colors to console output
            winston.format.printf(info => `${info.level}: ${info.message}`) // Simple format
        )
    })
];
// Create the main logger instance
const logger = winston.createLogger({
    level: 'silly', // Log all levels internally, let transports filter based on their level
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Add timestamp to file logs
        winston.format.errors({ stack: true }), // Log stack traces for Error objects
        winston.format.json() // Use JSON format for file logs
    ),
    transports: loggerTransports, // Add the configured transports
    exceptionHandlers: [ // Log uncaught exceptions to a file
        new winston.transports.File({ filename: path.join(logsDir, 'exceptions.log') })
    ],
    rejectionHandlers: [ // Log unhandled promise rejections to a file
         new winston.transports.File({ filename: path.join(logsDir, 'rejections.log') })
    ]
});
// Helper function to easily find a transport instance later
const findTransport = (transportType) => logger.transports.find(t => t instanceof transportType);


// --- FINAL YARGS CONFIGURATION (using the chosen language) ---
const yargsInstance = yargs(hideBin(process.argv)); // Get a fresh yargs instance

// Configure and parse arguments finally
const argv = await yargsInstance
    .detectLocale(false) // Disable yargs's own locale detection, we handle it
    .locale(chosenLang)  // Inform yargs about the active locale (may help internal messages)
    .usage(i18n.__('Usage: $0 [options]')) // Set usage string in the chosen language
    .config('config') // Enable reading options from a JSON config file via --config
    .options({
        // Define all operational options (NO 'version' or 'help' keys here)
        src:        { alias: 's', type: 'string', describe: i18n.__('Source folders (comma-separated)'), demandOption: false /* Required logic handled by promptIfMissing */ },
        ext:        { alias: 'e', type: 'string', describe: i18n.__('Extensions to copy (comma-separated, e.g. js,txt)'), demandOption: false },
        targetExt:  { alias: 't', type: 'string', describe: i18n.__('Output extension (e.g. txt)'), demandOption: false },
        dest:       { alias: 'd', type: 'string', describe: i18n.__('Destination folder'), demandOption: false },
        overwrite:  { alias: 'o', type: 'boolean', default: false, describe: i18n.__('Overwrite existing files') },
        'log-level':{ type: 'string', choices: ['error', 'warn', 'info', 'verbose', 'debug', 'silly'], describe: i18n.__('Enable console logging at specified level') },
        'dry-run':  { alias: 'D', type: 'boolean', default: false, describe: i18n.__('Simulate operations without copying files') },
        concurrency:{ alias: 'c', type: 'number', default: 5, describe: i18n.__('Number of parallel copy operations') },
        lang:       { type: 'string', choices: supportedLocales, describe: i18n.__('Interface language'), default: chosenLang, defaultDescription: i18n.getLocale() }
    })
    .completion('completion', i18n.__('Generate shell completion script')) // Add completion command
    // Use the dedicated .version() method correctly
    .version('version', i18n.__('Show version number'), pkg.version) // Provide key, desc, value
    .alias('version', 'V') // Keep the -V alias for the version flag
    // Use the dedicated .help() method
    .help('help') // Provide the key ('help') to enable standard help behavior
    .alias('help', 'h') // Keep the -h alias for the help flag
    .strict() // Report errors for unknown options or failed validations
    .wrap(yargsInstance.terminalWidth()) // Wrap help text to fit terminal width
    .fail((msg, err, yargs) => { // Custom handler for parsing/validation failures
        // Log the internal error if logging is enabled
        logger.error(`Yargs parsing/validation failed: ${msg}`, err);
        // Always print the user-friendly error message to stderr in red
        console.error(chalk.red(msg || err?.message || 'Argument validation failed'));
        // Print the translated help instructions
        console.error(i18n.__("See '--help' for usage instructions."));
        process.exit(1); // Exit with an error code
    })
    .parseAsync(); // Perform the final asynchronous parsing


// --- Main Application Logic ---
// This IIFE (Immediately Invoked Function Expression) contains the core script logic
(async () => {
    // Language is already set (chosenLang), logger is configured

    // --- Configure Console Logging based on final --log-level argument ---
    const consoleTransport = findTransport(winston.transports.Console);
    if (argv.logLevel && consoleTransport) {
        // If --log-level was provided, make the console transport active at that level
        console.log(chalk.yellow(`${i18n.__('Console logging enabled at level')}: ${argv.logLevel}`)); // Inform user
        consoleTransport.silent = false; // Unsilence the transport
        consoleTransport.level = argv.logLevel; // Set the level
    } else if (consoleTransport) {
        // Otherwise, ensure the console transport remains silent
        consoleTransport.silent = true;
    }
    // --- End Console Logging Configuration ---

    // Log script start (respects --log-level)
    logger.info(`Using language: ${chosenLang}`);
    logger.info(chalk.blue(`copy-cli v${pkg.version} ${i18n.__('started')}.`));
    if (argv.config) { // Log if a config file was used
        logger.info(i18n.__('Using configuration file: %s', argv.config));
    }

    // --- Load Plugins ---
    const pluginsDir = path.join(__dirname, 'plugins');
    try {
        // Find potential plugin files
        const pluginFiles = await fg(path.join(pluginsDir, '*.{js,mjs}').replace(/\\/g, '/')); // Support .js and .mjs
        logger.info(i18n.__('Searching for plugins in: %s', pluginsDir));
        if (pluginFiles.length > 0) {
            logger.info(i18n.__('Found plugins: %s', pluginFiles.map(f => path.basename(f)).join(', ')));
            // Iterate and attempt to load each plugin
            for (const file of pluginFiles) {
                const pluginName = path.basename(file);
                try {
                    const fileUrl = new URL(`file://${path.resolve(file)}`); // Use file URL for dynamic import
                    const mod = await import(fileUrl);
                    // Check if the plugin has an install function
                    if (typeof mod.install === 'function') {
                        // Execute the install function, passing context (logger, i18n, args)
                        // Use Promise.resolve to handle both sync and async install functions gracefully
                        await Promise.resolve(mod.install({ logger, i18n, argv }));
                        logger.info(i18n.__('Plugin loaded successfully: %s', pluginName));
                    } else {
                         logger.warn(i18n.__('Plugin file found but no install function exported: %s', pluginName));
                    }
                } catch (pluginError) {
                    logger.error(i18n.__('Failed to load or execute plugin: %s', pluginName), pluginError);
                    // Decide if plugin loading errors should be fatal or just logged
                }
            }
        } else {
            logger.info(i18n.__('No plugins found.'));
        }
    } catch (pluginSearchError) {
        logger.error(i18n.__('Error searching for plugins:'), pluginSearchError);
    }


    // --- Get Required Parameters (with Interactive Fallback) ---
    // Define validation functions using the current locale
    const requiredString = (val) => (typeof val === 'string' && val.trim().length > 0) || i18n.__('Value cannot be empty');
    const requiredCommaList = (val) => {
       if (!(typeof val === 'string' && val.trim().length > 0)) return i18n.__('Value cannot be empty');
       // Allow different separators and trim whitespace
       const items = val.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
       if (items.length === 0) return i18n.__('Value cannot be empty');
       // Basic validation for file extensions / folder names (adjust regex if needed)
       if (items.some(item => !/^[a-zA-Z0-9_.-]+$/.test(item))) return i18n.__('Contains invalid characters');
       return true; // Return true if valid
     };
    const requiredSingleExtension = (val) => typeof val === 'string' && /^[a-zA-Z0-9_.-]+$/.test(val.trim()) || i18n.__('Must be a single valid extension');

    // Helper function to get required args, prompting if missing and in interactive mode
    async function promptIfMissing(argName, promptConfig, validationFn) {
        let value = argv[argName]; // Get value from the finally parsed arguments
        let isValid = false;

        // 1. Check if value exists and is valid from CLI/config
        if (value != null) {
            const validationResult = await Promise.resolve(validationFn(value));
            if (validationResult === true) {
                isValid = true;
            } else {
                // Value provided but invalid - this should ideally be caught by yargs .fail()
                // but we add a manual check just in case.
                logger.error(i18n.__('Invalid value provided for required option --%s: %s', argName, validationResult));
                console.error(chalk.red(i18n.__('Invalid value provided for required option --%s: %s', argName, validationResult)));
                process.exit(1);
            }
        }

        // 2. Prompt if value is missing and we are in an interactive terminal
        if (!isValid && process.stdout.isTTY) {
            logger.info(i18n.__('Missing required argument: %s. Prompting user...', argName)); // Log if enabled
            try {
               // Use the @inquirer/prompts input function with validation
              value = await input({ ...promptConfig, validate: validationFn });
              isValid = true; // Assume prompt's validation passed if it resolves
            } catch (promptError) {
                // Handle prompt cancellation (e.g., Ctrl+C)
                console.error(chalk.red(`\n${argName} input cancelled or failed.`), promptError.message);
                process.exit(1);
            }
        } else if (!isValid) {
            // Not interactive and value is still missing (should have been caught by yargs .fail)
           console.error(chalk.red(i18n.__('Missing required argument: --%s', argName)));
           yargsInstance.showHelp(); // Show help before exiting
           process.exit(1);
        }
        return value; // Return the valid value
    }

    // Get required operational parameters using the helper
    // **** ENSURE THE KEYS HERE EXACTLY MATCH YOUR CLEAN JSON FILES ****
    const src = await promptIfMissing('src', { message: i18n.__('Enter Source folders (comma-separated)') }, requiredCommaList);
    const ext = await promptIfMissing('ext', { message: i18n.__('Enter Extensions to copy (e.g., js,txt)') }, requiredCommaList); // Key check!
    const targetExt = await promptIfMissing('targetExt', { message: i18n.__('Enter Output extension (e.g., txt)') }, requiredSingleExtension); // Key check!
    const dest = await promptIfMissing('dest', { message: i18n.__('Enter Destination folder') }, requiredString);

    // Get non-required parameters directly from argv (yargs handles defaults)
    const overwrite = argv.overwrite;
    const dryRun = argv['dry-run'];
    const concurrency = argv.concurrency;


    // --- Pre-execution Checks ---
    try {
        // Ensure the destination directory exists, create if necessary
        logger.info(i18n.__('Ensuring destination directory exists: %s', dest));
        await fs.mkdir(dest, { recursive: true });
        logger.info(i18n.__('Destination directory ensured: %s', dest));
    } catch (destErr) {
        // Handle error creating destination directory
        logger.error(i18n.__('Failed to create destination directory: %s', dest), destErr);
        console.error(chalk.red(i18n.__('Failed to create destination directory: %s', dest)));
        process.exit(1);
    }

    // --- Final Confirmation (Interactive Only) ---
    // Ask for confirmation only if interactive and not doing a dry run
    if (process.stdout.isTTY && !dryRun) {
        try {
            const proceed = await confirm({ message: i18n.__('Start copy operation now?'), default: true });
            if (!proceed) {
                // User chose not to proceed
                logger.warn(i18n.__('Operation cancelled by user.')); // Log if enabled
                console.log(i18n.__('Operation cancelled by user.')); // Always inform user
                process.exit(0); // Exit gracefully
            }
        } catch(promptError) {
            // Handle confirmation cancellation
            console.error(chalk.red(`\nConfirmation prompt cancelled or failed.`), promptError.message);
            process.exit(1);
        }
    }

    // --- File Search ---
    logger.info(i18n.__('Searching for files...')); // Log search start if enabled
    // Start the ora spinner for visual feedback
    const spinner = ora(i18n.__('🔍 Searching for files...')).start();

    // Prepare source directories and extensions lists from input strings
    const sourceDirsList = src.split(/[,;\s]+/).map(d => d.trim()).filter(Boolean);
    const extensionsList = ext.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean);

    // Validate that we have valid sources and extensions
    if (sourceDirsList.length === 0 || extensionsList.length === 0) {
        spinner.fail(chalk.red(i18n.__('Invalid or empty source directories or extensions provided.')));
        process.exit(1);
    }
    // Update spinner text with more detail
    spinner.text = i18n.__('🔍 Searching in %s for extensions [%s]', sourceDirsList.join(', '), extensionsList.join(', '));

    // Generate glob patterns for fast-glob
    const patterns = sourceDirsList.flatMap(dir =>
        extensionsList.map(e => path.join(dir, `**/*.${e}`).replace(/\\/g, '/')) // Ensure forward slashes
    );
    logger.debug('Glob patterns:', patterns); // Log patterns if debug enabled

    let files = []; // Array to hold found file paths
    try {
        // Execute the search using fast-glob
        files = await fg(patterns, {
            dot: false,                // Exclude dotfiles (like .git)
            onlyFiles: true,           // Ensure we only get files, not directories
            absolute: true,            // Get absolute paths for easier handling later
            caseSensitiveMatch: false, // More user-friendly on Windows/macOS
            ignore: ['**/node_modules/**'] // Commonly ignored directory
        });
        // Stop spinner with success message
        spinner.succeed(i18n.__('Found %d file(s) matching criteria.', files.length));
    } catch (searchError) {
        // Handle errors during file search
        spinner.fail(chalk.red(i18n.__('Error during file search.')));
        logger.error('File search error details:', searchError); // Log details if enabled
        process.exit(1);
    }

    // Check if any files were found
    if (!files.length) {
        logger.warn(i18n.__('No files found matching the specified criteria. Nothing to copy.')); // Log if enabled
        console.log(i18n.__('No files found matching the specified criteria. Nothing to copy.')); // Always inform user
        process.exit(0); // Exit gracefully as there's nothing to do
    }


    // --- Dry Run ---
    if (dryRun) {
        // If dry run flag is set, just print what would happen
        console.log(chalk.yellow(i18n.__('--- DRY RUN MODE ---')));
        console.log(i18n.__('The following operations would be performed:'));
        files.forEach(file => {
            // Calculate source and potential target paths relative to current directory
            const sourceRelativePath = path.relative(process.cwd(), file);
            const base = path.basename(file, path.extname(file));
            const targetName = `${base}.${targetExt}`;
            const targetFullPath = path.join(dest, targetName);
            const targetRelativePath = path.relative(process.cwd(), targetFullPath);

            let existsStatus = ''; // Check if target would exist and how it would be handled
            try {
                if (fsSync.existsSync(targetFullPath)) { // Use sync check for simplicity in dry run
                    existsStatus = overwrite
                        ? ` ${chalk.magenta(i18n.__('[Info] Target exists - would overwrite'))}`
                        : ` ${chalk.yellow(i18n.__('[Warning] Target exists - would rename'))}`;
                }
            } catch { /* Ignore errors checking existence in dry run */ }

            // Print the planned operation
            console.log(` • Copy: ${chalk.blue(sourceRelativePath)} → ${chalk.green(targetRelativePath)}${existsStatus}`);
        });
        console.log(chalk.yellow(i18n.__('--- END DRY RUN ---')));
        process.exit(0); // Exit after dry run
    }

    // --- File Copy Execution ---
    const limit = pLimit(concurrency); // Create concurrency limiter instance
    logger.info(i18n.__('Starting copy process with concurrency=%d', concurrency)); // Log start if enabled

    // Configure the progress bar
    const bar = new cliProgress.SingleBar({
        format: `${chalk.cyan(i18n.__('Copying'))} | {bar} | {percentage}% || {value}/{total} ${i18n.__('Files')} {eta_formatted}`, // Include ETA
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
        etaBuffer: 100, // Adjust buffer for smoother ETA calculation
        // Handle non-TTY environments gracefully (e.g., CI, file redirection)
        noTTYOutput: !process.stdout.isTTY, // Disable fancy bar if not TTY
        notTTYSchedule: 5000 // Update interval in ms when not TTY (if needed for logging)
    }, cliProgress.Presets.shades_classic);

    // Start progress bar only if in an interactive terminal
    if (process.stdout.isTTY) {
        bar.start(files.length, 0);
    } else {
        // Log progress start in non-TTY environment instead of showing bar
        logger.info(i18n.__('Progress bar disabled in non-TTY environment. Starting copy...'));
    }

    // Prepare arrays for promises and errors
    const copyPromises = [];
    const errors = [];
    let copiedCount = 0; // Counter for successfully copied files

    // Iterate over each file found and create a limited promise for copying it
    for (const file of files) {
        copyPromises.push(limit(async () => {
            const sourceRelative = path.relative(process.cwd(), file); // For logging purposes
            try {
                // Determine base filename and initial target path
                const base = path.basename(file, path.extname(file));
                let targetName = `${base}.${targetExt}`;
                let targetPath = path.join(dest, targetName);

                // Handle non-overwrite logic: check if target exists and rename if needed
                if (!overwrite) {
                    let i = 1;
                    let currentTargetPath = targetPath;
                    // Loop to find a non-existent filename
                    while (true) {
                         try {
                             // Check if file exists using async access check
                             await fs.access(currentTargetPath, fs.constants.F_OK);
                             // File exists, generate a new name with suffix _i
                             targetName = `${base}_${i}.${targetExt}`;
                             currentTargetPath = path.join(dest, targetName);
                             i++;
                         } catch (e) {
                             // File does not exist, use this path
                             targetPath = currentTargetPath;
                             break; // Exit the while loop
                         }
                     }
                }

                // Perform the actual file copy operation
                await fs.copyFile(file, targetPath);
                copiedCount++; // Increment success counter
                // Log successful copy details if verbose logging is enabled
                logger.verbose(`Copied: ${sourceRelative} -> ${path.relative(process.cwd(), targetPath)}`);
                // Increment progress bar only if it was started (TTY environment)
                if (process.stdout.isTTY) bar.increment();

            } catch (copyError) {
                // Handle errors during individual file copy
                logger.error(i18n.__('Error copying file %s:'), sourceRelative, copyError); // Log error if enabled
                errors.push({ file: sourceRelative, error: copyError.message || copyError }); // Store error details
                // Increment bar even on error if TTY to keep total count correct
                 if (process.stdout.isTTY) bar.increment();
            }
        }));
    }

    // Wait for all copy promises (respecting concurrency limit) to settle
    await Promise.all(copyPromises);

    // Stop progress bar if it was started
    if (process.stdout.isTTY) bar.stop();

    // --- Post-execution Summary ---
    const finalSuccessCount = copiedCount; // Use the counter incremented on actual success
    if (errors.length > 0) {
        // If errors occurred, print error summary to console
        // Use simple __ for the error count itself
        console.error(chalk.red(i18n.__('Copy operation completed with %d error(s).', errors.length)));
        errors.forEach(err => console.error(chalk.red(` - ${err.file}: ${err.error}`)));
        // Also print number of successes if any, using __n for pluralization
         if (finalSuccessCount > 0) {
            // Use the new keys for singular/plural success count
            console.log(chalk.yellow(i18n.__n('%d file copied successfully', '%d files copied successfully', finalSuccessCount)));
         }
         // Log detailed error summary if logging enabled
         logger.error(i18n.__('Copy operation completed with %d error(s). %d succeeded. Errors: %s', errors.length, finalSuccessCount, JSON.stringify(errors)));
        process.exit(1); // Exit with error code
    } else {
        // If no errors, print success message to console using __n for pluralization
        // Use the new keys for singular/plural completion message
        console.log(chalk.green(i18n.__n('🚀 Copy operation completed successfully: %d file copied.', '🚀 Copy operation completed successfully: %d files copied.', finalSuccessCount)));
        // Also log success message if logging enabled, using __n
        logger.info(i18n.__n('🚀 Copy operation completed successfully: %d file copied.', '🚀 Copy operation completed successfully: %d files copied.', finalSuccessCount));
        process.exit(0); // Exit successfully
    }


})().catch(err => { // Catch any unhandled errors within the main async IIFE execution
  logger.error(chalk.red(i18n.__('An unexpected critical error occurred in main execution:')), err); // Log if enabled
  console.error(chalk.red(i18n.__('An unexpected critical error occurred:'))); // Always show critical error
  console.error(err); // Print the full error stack trace
  process.exit(1); // Exit with error code
});

// Add top-level error handlers for issues occurring *before* the main async IIFE's catch block
process.on('uncaughtException', (err, origin) => {
    console.error(chalk.red(`FATAL UNCAUGHT EXCEPTION (Origin: ${origin}):`), err);
    // Attempt to log using the logger if it's initialized, otherwise just use console
    try {
        if (logger) logger.error(`FATAL UNCAUGHT EXCEPTION (Origin: ${origin}):`, err);
    } catch { /* ignore logger errors during fatal exit */}
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('FATAL UNHANDLED REJECTION:'), reason);
    // Attempt to log using the logger if initialized
    try {
        if (logger) logger.error('FATAL UNHANDLED REJECTION:', { reason, promise });
    } catch { /* ignore logger errors during fatal exit */}
    process.exit(1);
});
