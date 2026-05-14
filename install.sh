#!/usr/bin/env bash

# ShpleetCode Installer
# Sets up the NeetCode practice environment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LEETCODE_DIR="$HOME/.leetcode"
MCP_CONFIG="$HOME/.config/mcp-servers/mcp_config.json"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════╗"
echo "║                                       ║"
echo "║     ShpleetCode Installer  🚀         ║"
echo "║                                       ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Check dependencies
echo -e "${YELLOW}Checking dependencies...${NC}"
missing=()

command -v fzf >/dev/null 2>&1 || missing+=("fzf")
command -v tmux >/dev/null 2>&1 || missing+=("tmux")
command -v nvim >/dev/null 2>&1 || missing+=("nvim")
command -v claude >/dev/null 2>&1 || missing+=("claude")
command -v node >/dev/null 2>&1 || missing+=("node")

if [ ${#missing[@]} -gt 0 ]; then
  echo -e "${RED}Error: Missing required dependencies: ${missing[*]}${NC}"
  echo ""
  echo "Install instructions:"
  echo "  fzf:   https://github.com/junegunn/fzf"
  echo "  tmux:  sudo apt install tmux"
  echo "  nvim:  https://neovim.io/"
  echo "  claude: npm install -g @anthropic-ai/claude-code"
  echo "  node:  https://nodejs.org/"
  exit 1
fi

echo -e "${GREEN}✓ All dependencies found${NC}"

# Install MCP server dependencies
echo -e "${YELLOW}Installing MCP server dependencies...${NC}"
cd "$SCRIPT_DIR/leetcode-mcp-server"
npm install
echo -e "${GREEN}✓ MCP server dependencies installed${NC}"

# Scrape problems
echo -e "${YELLOW}Scraping NeetCode problems...${NC}"
npm run scrape
echo -e "${GREEN}✓ Problems database created${NC}"

# Create .leetcode directory
mkdir -p "$LEETCODE_DIR/workspace"

# Configure MCP server in Claude Code
echo -e "${YELLOW}Configuring Claude Code MCP server...${NC}"

mkdir -p "$(dirname "$MCP_CONFIG")"

if [ ! -f "$MCP_CONFIG" ]; then
  # Create new config file
  cat > "$MCP_CONFIG" <<EOF
{
  "mcpServers": {
    "leetcode": {
      "command": "node",
      "args": ["$SCRIPT_DIR/leetcode-mcp-server/index.js"],
      "env": {}
    }
  }
}
EOF
  echo -e "${GREEN}✓ Created MCP config${NC}"
else
  # Config exists - check if leetcode server already configured
  if grep -q '"leetcode"' "$MCP_CONFIG"; then
    echo -e "${YELLOW}LeetCode MCP server already configured${NC}"
    echo -e "${YELLOW}You may need to manually update the path in: $MCP_CONFIG${NC}"
  else
    # Add leetcode server to existing config
    echo -e "${YELLOW}Adding LeetCode MCP server to existing config...${NC}"
    # Use node to safely merge JSON
    node -e "
      const fs = require('fs');
      const config = JSON.parse(fs.readFileSync('$MCP_CONFIG', 'utf8'));
      config.mcpServers.leetcode = {
        command: 'node',
        args: ['$SCRIPT_DIR/leetcode-mcp-server/index.js'],
        env: {}
      };
      fs.writeFileSync('$MCP_CONFIG', JSON.stringify(config, null, 2));
    "
    echo -e "${GREEN}✓ Added LeetCode MCP server to config${NC}"
  fi
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo "To start practicing, run:"
echo -e "${GREEN}  ./start-leetcode${NC}"
echo ""
