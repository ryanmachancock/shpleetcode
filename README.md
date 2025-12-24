# ShpleetCode

Terminal-based NeetCode/LeetCode practice environment with Claude Code integration.

## Features

- Interactive problem browser with fzf
- 3-pane tmux layout: solution editor, Claude assistant, problem description
- Automatic file tracking - Claude sees your code without manual copying
- Progress tracking by category and difficulty
- 150 NeetCode problems with descriptions and examples

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/shpleetcode.git
cd shpleetcode
./install.sh
```

The installer will:
- Check for required dependencies (fzf, tmux, nvim, claude, node)
- Install MCP server dependencies
- Scrape NeetCode problems
- Configure Claude Code to use the MCP server

## Usage

Start the environment:

```bash
./start-leetcode
```

This launches a tmux session with:
- Left: Neovim with your solution file
- Top-right: Claude Code with MCP server
- Bottom-right: Neovim displaying the problem description

Files auto-save after 1 second of inactivity, so Claude always sees your latest code.

## Dependencies

- [fzf](https://github.com/junegunn/fzf) - Fuzzy finder
- [tmux](https://github.com/tmux/tmux) - Terminal multiplexer
- [Neovim](https://neovim.io/) - Text editor
- [Claude Code](https://github.com/anthropics/claude-code) - AI assistant
- [Node.js](https://nodejs.org/) - JavaScript runtime

## MCP Tools

Claude has access to these tools:

- `get_current_problem()` - Get your current file contents
- `list_problems()` - Browse all problems with filters
- `get_problem(id)` - Get problem details
- `mark_solved(id)` - Mark problem complete
- `get_progress()` - View your stats
- `search_problems(query)` - Search by title or tags

## Project Structure

```
shpleetcode/
├── start-leetcode       # Main launcher
├── install.sh          # Setup script
└── leetcode-mcp-server/
    ├── index.js        # MCP server
    ├── scraper.js      # Problem fetcher
    └── package.json

~/.leetcode/
├── problems.json       # Problem database
├── progress.json       # Your progress
└── workspace/          # Your solutions
    ├── arrays-hashing/
    ├── two-pointers/
    └── ...
```

## Tips

- Filter by difficulty: `./start-leetcode Easy`
- Problems marked `[B75]` are from the Blind 75 list
- Ask Claude for hints, not solutions
- Use `Ctrl-h/l` to navigate between panes

## License

MIT
