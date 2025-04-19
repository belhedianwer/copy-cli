# Copy CLI (`copy-cli`)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An interactive command-line interface (CLI) tool for copying files with advanced features like filtering, configuration files, internationalization (i18n), logging, plugins, and more. Built with Node.js.

## ✨ Features

*   **Interactive Prompts:** Guides users through options if arguments are missing.
*   **File Filtering:** Copy files based on source folders and specific extensions.
*   **Extension Renaming:** Optionally change the file extension during the copy process.
*   **Concurrency Control:** Perform multiple file copies in parallel for speed.
*   **Overwrite Protection:** Choose to overwrite existing files or automatically rename copies to avoid conflicts.
*   **Dry Run Mode:** Simulate the copy operation without actually modifying any files.
*   **Configuration File:** Define options in a JSON file (`--config`).
*   **Environment Variables:** Load configuration from a `.env` file.
*   **Internationalization (i18n):** Interface available in multiple languages (EN, FR, ES, AR).
*   **Logging:** Detailed logging to console (optional levels) and files (`logs/`).
*   **Plugin System:** Extend functionality with custom JavaScript plugins.
*   **Progress Visualization:** Shows spinners and progress bars for long operations.
*   **Update Notifications:** Checks for newer versions of the tool.

## 📦 Installation

**Globally (Recommended for direct use):**

```bash
npm install -g copy-cli
```

Then you can run the command directly:

```bash
copy-cli --src my-code --ext js --dest backup/js --targetExt bak
```

**Using npx (Without global installation):**

```bash
npx copy-cli --src my-code --ext js --dest backup/js --targetExt bak
```

**Locally (For development):**

```bash
git clone https://github.com/belhedianwer/copy-cli.git # Replace with your repo URL
cd copy-cli
npm install
npm start -- --src my-code --ext js --dest backup/js # Note the extra '--'
# or directly
node index.js --src my-code --ext js --dest backup/js
```

## 🚀 Usage

The basic command structure is:

```bash
copy-cli [options]
```

If required options (`src`, `ext`, `targetExt`, `dest`) are not provided via command line or config file, the tool will prompt you interactively.

### Options

| Option                 | Alias | Type      | Default   | Description                                                   |
| :--------------------- | :---- | :-------- | :-------- | :------------------------------------------------------------ |
| `--src`                | `-s`  | `string`  | *Required*| Source folders (comma-separated).                             |
| `--ext`                | `-e`  | `string`  | *Required*| File extensions to copy (comma-separated, e.g., `js,txt`).   |
| `--targetExt`          | `-t`  | `string`  | *Required*| Output extension for copied files (e.g., `txt`, `bak`).       |
| `--dest`               | `-d`  | `string`  | *Required*| Destination folder.                                           |
| `--overwrite`          | `-o`  | `boolean` | `false`   | Overwrite existing files in the destination.                  |
| `--log-level`          |       | `string`  | `null`    | Enable console logging (`error`,`warn`,`info`,`verbose`,`debug`,`silly`). |
| `--dry-run`            | `-D`  | `boolean` | `false`   | Simulate operations without copying files.                    |
| `--concurrency`        | `-c`  | `number`  | `5`       | Number of parallel copy operations.                         |
| `--lang`               |       | `string`  | (Prompt)  | Interface language (`en`, `fr`, `es`, `ar`).                  |
| `--config`             |       | `string`  | `null`    | Path to a JSON configuration file.                            |
| `--help`               | `-h`  | `boolean` |           | Show help message.                                            |
| `--version`            | `-V`  | `boolean` |           | Show version number.                                          |
| `--completion`         |       |           |           | Generate shell completion script.                             |

### Examples

**1. Basic Copy:** Copy all `.js` and `.css` files from `src/` and `lib/` to `dist/`:

```bash
copy-cli -s src,lib -e js,css -t js -d dist
```
*(Note: This example assumes you want the target extension to remain `js`. Adjust `-t` as needed.)*

**2. Change Extension:** Copy all `.md` files from `docs/` to `backup/`, changing their extension to `.txt`:

```bash
copy-cli --src docs --ext md --targetExt txt --dest backup
```

**3. Overwrite:** Copy files and overwrite any existing ones in the destination:

```bash
copy-cli -s src -e html -t html -d public -o
```

**4. Dry Run:** See what files *would* be copied without actually doing it:

```bash
copy-cli -s assets -e png,jpg --targetExt img -d images --dry-run
```

**5. Use French Interface & Log Info:**

```bash
copy-cli --lang fr --log-level info -s src -e py -t py -d app
```

## ⚙️ Configuration

Options can be provided in multiple ways, with the following precedence (highest first):

1.  **Command-line arguments** (e.g., `--src value`)
2.  **Environment variables** (loaded from `.env` file)
3.  **Configuration file** (specified via `--config`)
4.  **Interactive prompts** (if an option is missing)
5.  **Default values**

### Config File (`--config`)

You can store options in a JSON file and pass its path using `--config`.

*Example `config.json`:*

```json
{
  "src": "source/code,shared/utils",
  "ext": "ts,tsx",
  "targetExt": "js",
  "dest": "build",
  "concurrency": 10,
  "overwrite": false,
  "lang": "en"
}
```

*Usage:*

```bash
copy-cli --config config.json
```

### Environment Variables (`.env`)

Create a `.env` file in the directory where you run the command. Currently supported environment variables:

*   `LOG_LEVEL`: Overrides the default logging level for files (e.g., `LOG_LEVEL=debug`). Does not affect console unless `--log-level` is also used.

*Example `.env`:*

```dotenv
LOG_LEVEL=debug
# Other potential future variables could be added here
```

## 🌍 Internationalization (i18n)

The CLI interface supports multiple languages.

*   **Selection:**
    *   Use the `--lang` option (e.g., `--lang fr`, `--lang ar`).
    *   If `--lang` is not provided, you will be prompted to select a language interactively.
*   **Supported Languages:** English (`en`), French (`fr`), Spanish (`es`), Arabic (`ar`).
*   **Translation Files:** Translations are stored in `.json` files within the `locales/` directory relative to the installed script.

*Note:* Arabic text rendering depends heavily on the terminal emulator's support for Right-to-Left (RTL) text and complex scripts. Use terminals like Konsole or up-to-date GNOME Terminal for best results.

## 🧩 Plugins

Extend `copy-cli`'s functionality by creating plugins.

*   **Location:** Place your plugin JavaScript files (using `.js` or `.mjs` extension) inside a `plugins/` directory located at the same level as the main `index.js` script.
*   **Structure:** Each plugin must export an `install` function (can be `async`).
*   **Context:** The `install` function receives an object containing:
    *   `logger`: The configured Winston logger instance.
    *   `i18n`: The configured i18n instance.
    *   `argv`: The parsed command-line arguments object from yargs.

*Example `plugins/timestamp-plugin.js`:*

```javascript
/**
 * Timestamp Plugin for copy-cli
 */
export async function install({ logger, i18n, argv }) {
    const startTime = new Date();
    // Remember to add "Plugin initialized at %s" to locale files!
    logger.info(`[TimestampPlugin] ${i18n.__('Plugin initialized at %s', startTime.toLocaleTimeString())}`);

    if (argv['dry-run']) {
        // Remember to add "Dry run mode detected by plugin." to locale files!
        logger.info(`[TimestampPlugin] ${i18n.__('Dry run mode detected by plugin.')}`);
    }

    process.on('exit', (code) => {
        const endTime = new Date();
        const duration = (endTime - startTime) / 1000;
        // Remember to add "Plugin exiting. Code: %s, Duration: %s sec" to locale files!
        // Use console.log as logger might be closed.
        console.log(
            `[TimestampPlugin] ${i18n.__('Plugin exiting. Code: %s, Duration: %s sec', code, duration.toFixed(2))}`
        );
    });
}
```

## 🪵 Logging

*   **Console Logging:** Disabled by default. Use `--log-level <level>` to enable console output at a specific level (`error`, `warn`, `info`, `verbose`, `debug`, `silly`).
*   **File Logging:** Logs are always written to the `logs/` directory (relative to the script's location):
    *   `logs/error.log`: Contains only `error` level messages.
    *   `logs/combined.log`: Contains `info` level and above messages.
    *   `logs/exceptions.log`: Records uncaught exceptions.
    *   `logs/rejections.log`: Records unhandled promise rejections.
    File logs include timestamps and are in JSON format.

## 🤝 Contributing

1.  Fork the repository
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

### Code Style Guidelines

*   Keep functions small and focused
*   Use meaningful variable names
*   Add comments for complex logic

## 📝 License

This project is licensed under the MIT License - see the `LICENSE` file for details. (You should create a `LICENSE` file containing the MIT license text).

## 📧 Contact

Anwer Awled Belhedi

*   Website: [anwer-awled-belhedi.com](https://anwer-awled-belhedi.com)
*   LinkedIn: [linkedin.com/in/aabyna](https://www.linkedin.com/in/aabyna)
*   GitHub: [github.com/belhedianwer](https://github.com/belhedianwer)
