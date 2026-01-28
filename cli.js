#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Check for puppeteer
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.error('Error: puppeteer not installed. Run: npm install puppeteer');
  process.exit(1);
}

const TEMPLATE_PATH = path.join(__dirname, 'template.html');

function generateMessageHTML(messages, options = {}) {
  return messages.map((msg, idx) => {
    const direction = msg.incoming ? 'incoming' : 'outgoing';
    const time = msg.time || '';
    const senderName = msg.sender && msg.incoming ? 
      `<div class="sender-name">${msg.sender}</div>` : '';
    
    // Check if this is the last message in a sequence from same sender
    const nextMsg = messages[idx + 1];
    const hasTail = !nextMsg || nextMsg.incoming !== msg.incoming;
    const tailClass = hasTail ? 'has-tail' : '';
    
    // Read receipts as checkmarks
    let readReceipt = '';
    if (!msg.incoming) {
      readReceipt = msg.read 
        ? '<span class="read-receipt"><span class="check read">✓✓</span></span>'
        : '<span class="read-receipt"><span class="check">✓</span></span>';
    }
    
    // Check if emoji-only message
    const emojiOnly = /^[\p{Emoji}\s]+$/u.test(msg.text) && msg.text.length <= 8;
    const emojiClass = emojiOnly ? 'emoji-only' : '';
    
    return `
      <div class="message-row ${direction}">
        <div class="message ${direction} ${tailClass} ${emojiClass}">
          ${senderName}
          <span class="message-content">${escapeHTML(msg.text)}</span>
          <span class="message-footer">
            <span class="message-time">${time}</span>
            ${readReceipt}
          </span>
        </div>
      </div>
    `;
  }).join('\n');
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

async function generateScreenshot(config, outputPath) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  
  const avatarContent = config.avatarUrl 
    ? `<img src="${config.avatarUrl}" alt="avatar">`
    : (config.avatarEmoji || config.chatName?.charAt(0) || '🤖');
  
  const botBadge = config.isBot ? '<span class="bot-badge">BOT</span>' : '';
  const theme = config.theme === 'light' ? 'light' : '';
  
  const statusTime = config.statusTime || new Date().toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: false 
  }).replace(/^0/, '');
  
  const html = template
    .replace('{{THEME}}', theme)
    .replace('{{STATUS_TIME}}', statusTime)
    .replace('{{AVATAR}}', avatarContent)
    .replace('{{CHAT_NAME}}', config.chatName || 'Chat')
    .replace('{{BOT_BADGE}}', botBadge)
    .replace('{{STATUS}}', config.status || 'online')
    .replace('{{MESSAGES}}', generateMessageHTML(config.messages || []));
  
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  
  await page.setViewport({ 
    width: config.width || 480, 
    height: config.height || 800,
    deviceScaleFactor: config.scale || 2
  });
  
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  // Auto-height based on content if not specified
  if (!config.height) {
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ 
      width: config.width || 480, 
      height: Math.min(bodyHeight, 1200),
      deviceScaleFactor: config.scale || 2
    });
  }
  
  await page.screenshot({ 
    path: outputPath,
    type: 'png',
    fullPage: config.fullPage || false
  });
  
  await browser.close();
  
  console.log(`Screenshot saved: ${outputPath}`);
  return outputPath;
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Telegram Screenshot Generator

Usage:
  tg-screenshot <config.json> [output.png]
  tg-screenshot --demo
  cat config.json | tg-screenshot - output.png

Config JSON format:
{
  "chatName": "Jarvis",
  "status": "online",
  "isBot": true,
  "avatarEmoji": "🤖",
  "theme": "dark",
  "messages": [
    { "text": "Hello!", "incoming": true, "time": "09:41" },
    { "text": "Hi there", "incoming": false, "time": "09:42", "read": true }
  ]
}

Options:
  --demo        Generate a demo screenshot
  --help, -h    Show this help
`);
    process.exit(0);
  }
  
  if (args.includes('--demo')) {
    const demoConfig = {
      chatName: "Jarvis",
      status: "online",
      isBot: true,
      avatarEmoji: "🤖",
      theme: "dark",
      messages: [
        { text: "Good morning! Here's your briefing:", incoming: true, time: "07:01" },
        { text: "📧 Email: 3 urgent, 12 can wait\n📅 Today: 2 meetings (10am, 3pm)\n📈 BTC: $102,450 (+2.3%)\n🌤 Weather: 24°C, sunny", incoming: true, time: "07:01" },
        { text: "Want me to draft replies to the urgent emails?", incoming: true, time: "07:01" },
        { text: "Yes please", incoming: false, time: "07:03", read: true },
        { text: "Done! Drafts ready in Gmail. ✓", incoming: true, time: "07:04" },
        { text: "🔥", incoming: false, time: "07:04", read: true }
      ]
    };
    
    await generateScreenshot(demoConfig, 'demo-screenshot.png');
    process.exit(0);
  }
  
  let configPath = args[0];
  let outputPath = args[1] || 'screenshot.png';
  
  if (!configPath) {
    console.error('Usage: tg-screenshot <config.json> [output.png]');
    process.exit(1);
  }
  
  let config;
  
  if (configPath === '-') {
    // Read from stdin
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', async () => {
      config = JSON.parse(Buffer.concat(chunks).toString());
      await generateScreenshot(config, outputPath);
    });
  } else {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    await generateScreenshot(config, outputPath);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

module.exports = { generateScreenshot };
