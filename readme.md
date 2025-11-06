# Sleeper Fantasy Dashboard

A Node.js/TypeScript application that fetches and displays NFL fantasy league information from Sleeper.

## Project Structure

```
sleeper-fantasy-dashboard/
├── src/
│   └── server.ts          # Express server with API routes
├── public/
│   ├── index.html         # Frontend HTML
│   ├── styles.css         # Styles
│   └── app.js             # Frontend JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

## Setup Instructions

1. **Create the project directory:**
```bash
mkdir sleeper-fantasy-dashboard
cd sleeper-fantasy-dashboard
```

2. **Create the folder structure:**
```bash
mkdir src public
```

3. **Copy the files:**
   - Save `server.ts` to `src/server.ts`
   - Save `index.html`, `styles.css`, and `app.js` to the `public/` folder
   - Save `package.json` and `tsconfig.json` to the root directory

4. **Install dependencies:**
```bash
npm install
```

5. **Build the TypeScript code:**
```bash
npm run build
```

6. **Start the server:**
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

7. **Open your browser:**
Navigate to `http://localhost:3000`

## Features

- **League Standings** - Win-loss records and total points for each team
- **Top 3 Most Active Managers** - Ranked by total transactions with medal badges (gold/silver/bronze)
- **Trade Leaders** - Complete list of managers sorted by number of trades completed
- **Most Lopsided Trades** - Analyzes trades based on median player performance after the trade
  - Shows players traded and their median points per game after the trade
  - Displays number of games played after the trade
  - Calculates lopsidedness percentage based on value difference
  - Highlights the winning side of each trade
- **Most Transacted Players** - Top 10 players added/dropped throughout the season
- **Year Selection** - Dropdown to view different seasons (2017-2024)
- **Live Reload** - Auto-refreshes when you edit files in development
- **Responsive Design** - Works on desktop and mobile

## How Trade Analysis Works

The dashboard evaluates trades by:
1. Finding all trades in the league
2. For each player traded, fetching their weekly stats for all weeks AFTER the trade occurred
3. Calculating the median PPR score across those weeks
4. Summing up the median values for each side of the trade
5. Calculating the percentage difference to determine lopsidedness
6. Displaying the top 5 most lopsided trades with winner/loser indicators

## Statistics Sections Explained

### Most Active Managers
Tracks all transactions (adds, drops, trades) and ranks managers by total activity. Top 3 get special medal styling.

### Trade Leaders
Specifically counts only completed trades. Shows which managers are most active in trading players with other teams.

### Most Lopsided Trades
Uses actual player performance data after the trade to determine which trades were most unfair in hindsight.

### Most Transacted Players
Shows which players moved around the league most via adds and drops (not trades).

## API Endpoints

- `GET /api/user/:username` - Get user information
- `GET /api/user/:userId/leagues/:sport/:season` - Get user's leagues
- `GET /api/league/:leagueId/rosters` - Get league rosters
- `GET /api/league/:leagueId/users` - Get league users
- `GET /api/league/:leagueId/transactions/:week` - Get league transactions for a week
- `GET /api/players/nfl` - Get all NFL players
- `GET /api/stats/nfl/:season` - Get NFL player weekly stats for a season (fetches all 18 weeks)
- `GET /events` - Server-Sent Events for live reload

## Customization

To change the username, edit `public/app.js`:
```javascript
const username = 'your-username-here';
```

To change the season, use the dropdown menu in the interface.

## Tech Stack

- **Backend:** Node.js, Express, TypeScript
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **API:** Sleeper API v1
- **Live Reload:** Server-Sent Events (SSE) with chokidar

## Notes

- The stats API fetches data for all 18 weeks of the NFL season, which may take a few seconds on first load
- Trade analysis only works for seasons where stats data is available
- PPR scoring is used for trade analysis (falls back to Half-PPR or Standard if PPR unavailable)