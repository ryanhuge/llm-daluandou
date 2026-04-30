# LLM 大亂鬥

## Quick Start

Double-click `啟動 LLM 大亂鬥.command`.

It starts the local server and opens:

http://localhost:4173/

Keep the Terminal window open while using the app. Press `Ctrl-C` in that Terminal window to stop the server.

## Manual Start

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
