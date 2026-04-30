# LLM 大亂鬥

LLM 大亂鬥 is a local web app for comparing multiple LLM responses side by side.

It is designed for writers, editors, researchers, marketers, and other text workers who want a fast, practical way to understand what the latest models can do. Write one prompt, send it to several models at once, and compare their strengths in drafting, rewriting, summarizing, reasoning, tone, structure, and creative direction in a single view.

## Requirements

- Node.js 20 or later
- npm
- An API key from OpenRouter or another OpenAI-compatible provider

Check your Node.js version:

```sh
node --version
```

If Node.js is not installed, download it from:

https://nodejs.org/

## Install

```sh
git clone https://github.com/ryanhuge/llm-daluandou.git
cd llm-daluandou
npm start
```

Then open:

http://localhost:4173/

## Quick Start

On macOS, you can double-click `Start LLM Daluandou.command`.

There is also a Chinese-named launcher, `啟動 LLM 大亂鬥.command`, but the ASCII filename is usually friendlier for Finder, syncing tools, and downloaded repositories.

It starts the local server and opens:

http://localhost:4173/

Keep the Terminal window open while using the app. Press `Ctrl-C` in that Terminal window to stop the server.

## Manual Start

On macOS, Windows, or Linux:

```sh
npm start
```

## Configuration

Local API keys are stored in your user folder:

```sh
~/.llm-daluandou/config.json
```

That keeps secrets outside the project folder, so the repo can stay open source safely.

You can override the config path with:

```sh
LLM_DALUANDOU_CONFIG=/path/to/config.json npm start
```

For a fresh setup, use `data/config.example.json` as a reference, then add your API keys from the app's settings page.
