# Lighthouse Reports Automation

This tool automates the generation of **Google Lighthouse** reports for multiple web pages, running sequentially for both Mobile and Desktop, and saving results in **JSON** and **PDF** (A3 size) formats.

The configuration is optimized to match **PageSpeed Insights** profiles (using Moto G Power for Mobile).

## System Requirements

- **Node.js**: `v24.14.0` (or higher)
- **npm**: `11.9.0` (or higher)

## Installation

1. Clone or download this repository.
2. Open a terminal in the project folder.
3. Install the required dependencies:
   ```bash
   npm install
   ```

## URL Configuration

For the application to work, **you must create a file named `urls.csv`** in the root directory.

1. You can use `urls.example.csv` as a template.
2. Ensure the first line is `url` (the header).
3. Add one URL per line.

Example `urls.csv`:
```csv
url
https://www.google.com
https://www.wikipedia.org
```

## Usage

To start the audit process, run:

```bash
npm start
```

### Report Features

- **Organization**: Reports are saved in the `reports/` folder, organized by date (`YYYY-MM-DD`).
- **File Naming**: Each file includes the sanitized URL, device type (`mobile`/`desktop`), and a timestamp.
- **Expanded PDFs**: PDF reports are generated in **A3 size** with all diagnostic details and passed audits automatically expanded for easy and complete reading.

## Technical Notes

- The application uses **Puppeteer** to manage an internal browser and generate PDFs. You don't need Google Chrome installed on your system.
- The process is **sequential**: Only one URL and one strategy are processed at a time to ensure CPU availability and accurate performance metrics.
