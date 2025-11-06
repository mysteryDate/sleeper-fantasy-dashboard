import express, { Request, Response } from 'express';
import fetch from 'node-fetch';

const app = express();
const PORT = 3000;

// Store SSE clients
const clients: Response[] = [];

// Serve static files
app.use(express.static('public'));

// SSE endpoint for live reload
app.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial connection message
  res.write('data: connected\n\n');

  clients.push(res);

  req.on('close', () => {
    const index = clients.indexOf(res);
    if (index !== -1) {
      clients.splice(index, 1);
    }
  });
});

// Watch for file changes in development
if (process.env.NODE_ENV !== 'production') {
  // Dynamic import for chokidar
  import('chokidar').then((chokidar) => {
    const watcher = chokidar.watch('public', {
      ignored: /(^|[\/\\])\../,
      persistent: true
    });

    watcher.on('change', (path) => {
      console.log(`File ${path} changed, reloading clients...`);
      clients.forEach(client => {
        client.write('data: reload\n\n');
      });
    });

    console.log('📁 Watching for file changes...');
  }).catch(err => {
    console.log('Live reload not available:', err.message);
  });
}

// API Routes
app.get('/api/user/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const response = await fetch(`https://api.sleeper.app/v1/user/${username}`);

    if (!response.ok) {
      return res.status(404).json({ error: 'User not found' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

app.get('/api/user/:userId/leagues/:sport/:season', async (req: Request, res: Response) => {
  try {
    const { userId, sport, season } = req.params;
    const response = await fetch(`https://api.sleeper.app/v1/user/${userId}/leagues/${sport}/${season}`);

    if (!response.ok) {
      return res.status(404).json({ error: 'Leagues not found' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leagues' });
  }
});

app.get('/api/league/:leagueId/rosters', async (req: Request, res: Response) => {
  try {
    const { leagueId } = req.params;
    const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);

    if (!response.ok) {
      return res.status(404).json({ error: 'Rosters not found' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rosters' });
  }
});

app.get('/api/league/:leagueId/users', async (req: Request, res: Response) => {
  try {
    const { leagueId } = req.params;
    const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);

    if (!response.ok) {
      return res.status(404).json({ error: 'Users not found' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/league/:leagueId/transactions/:week', async (req: Request, res: Response) => {
  try {
    const { leagueId, week } = req.params;
    const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`);

    if (!response.ok) {
      return res.status(404).json({ error: 'Transactions not found' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.get('/api/players/nfl', async (req: Request, res: Response) => {
  try {
    const response = await fetch('https://api.sleeper.app/v1/players/nfl');

    if (!response.ok) {
      return res.status(404).json({ error: 'Players not found' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

app.get('/api/stats/nfl/:season', async (req: Request, res: Response) => {
  try {
    const { season } = req.params;

    // Fetch stats for all weeks (1-18) and combine them
    const allStats: any = {};
    const weekPromises = [];

    for (let week = 1; week <= 18; week++) {
      weekPromises.push(
        fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`)
          .then(res => res.json())
          .then(weekStats => ({ week, stats: weekStats }))
          .catch(() => ({ week, stats: {} }))
      );
    }

    const weeklyData = await Promise.all(weekPromises);

    // Organize by player ID with week-by-week stats
    weeklyData.forEach(({ week, stats }) => {
      Object.entries(stats).forEach(([playerId, playerStats]: [string, any]) => {
        if (!allStats[playerId]) {
          allStats[playerId] = {};
        }
        allStats[playerId][`week_${week}`] = playerStats;
      });
    });

    res.json(allStats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.listen(PORT, () => {
  console.log(`🏈 Sleeper Fantasy Server running at http://localhost:${PORT}`);
});