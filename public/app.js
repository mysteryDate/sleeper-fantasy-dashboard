const username = 'glammerGrrl666';
let currentSeason = 2025;

const NUM_TRANSACTED_PLAYERS = 10;
const NUM_LOPSIDED_TRADES = 10;

// Live reload in development
if (window.location.hostname === 'localhost') {
    const evtSource = new EventSource('/events');
    evtSource.onmessage = (event) => {
        if (event.data === 'reload') {
            console.log('Reloading page...');
            window.location.reload();
        }
    };
    evtSource.onerror = (error) => {
        console.log('Live reload connection error (this is normal if not in dev mode)');
    };
}

// Initialize the app
async function init() {
    const seasonSelect = document.getElementById('season-select');
    seasonSelect.value = currentSeason;

    seasonSelect.addEventListener('change', (e) => {
        currentSeason = parseInt(e.target.value);
        fetchUserLeagues();
    });

    await fetchUserLeagues();
}

async function fetchUserLeagues() {
    try {
        document.getElementById('content').innerHTML = `
            <div class="loading">Loading leagues for ${username} (${currentSeason} season)...</div>
        `;

        // Get user data from our backend
        const userResponse = await fetch(`/api/user/${username}`);
        if (!userResponse.ok) {
            throw new Error('User not found');
        }
        const userData = await userResponse.json();
        const userId = userData.user_id;

        // Get all leagues for the user
        const leaguesResponse = await fetch(`/api/user/${userId}/leagues/nfl/${currentSeason}`);
        if (!leaguesResponse.ok) {
            throw new Error('Failed to fetch leagues');
        }
        const leagues = await leaguesResponse.json();

        if (!leagues || leagues.length === 0) {
            document.getElementById('content').innerHTML = `
                <div class="error">No leagues found for ${username} in the ${currentSeason} season.</div>
            `;
            return;
        }

        // Fetch players data once
        const playersResponse = await fetch('/api/players/nfl');
        const playersData = await playersResponse.json();

        // Fetch player stats for the season
        const statsResponse = await fetch(`/api/stats/nfl/${currentSeason}`);
        const statsData = await statsResponse.json().catch(() => ({}));

        // Fetch detailed info for each league
        const leagueDetails = await Promise.all(
            leagues.map(async (league) => {
                const rostersResponse = await fetch(`/api/league/${league.league_id}/rosters`);
                const rosters = await rostersResponse.json();

                const usersResponse = await fetch(`/api/league/${league.league_id}/users`);
                const users = await usersResponse.json();

                // Fetch transactions for all weeks (1-18)
                const transactionsPromises = [];
                for (let week = 1; week <= 18; week++) {
                    transactionsPromises.push(
                        fetch(`/api/league/${league.league_id}/transactions/${week}`)
                            .then(res => res.json())
                            .catch(() => [])
                    );
                }
                const allTransactions = await Promise.all(transactionsPromises);
                const transactions = allTransactions.flat();

                return { league, rosters, users, transactions };
            })
        );

        displayLeagues(leagueDetails, playersData, statsData);
    } catch (error) {
        document.getElementById('content').innerHTML = `
            <div class="error">Error: ${error.message}</div>
        `;
    }
}

function displayLeagues(leagueDetails, playersData, statsData) {
    let html = '';

    leagueDetails.forEach(({ league, rosters, users, transactions }) => {
        // Create a map of user IDs to display names
        const userMap = {};
        users.forEach(user => {
            userMap[user.user_id] = user.display_name || user.username || 'Unknown';
        });

        // Sort rosters by wins, then points
        const sortedRosters = rosters
            .map(roster => {
                const wins = roster.settings.wins || 0;
                const losses = roster.settings.losses || 0;
                const ties = roster.settings.ties || 0;
                const points = roster.settings.fpts || 0;
                const pointsDecimal = roster.settings.fpts_decimal || 0;
                const totalPoints = points + (pointsDecimal / 100);

                return {
                    ...roster,
                    wins,
                    losses,
                    ties,
                    totalPoints,
                    ownerName: userMap[roster.owner_id] || 'Unknown'
                };
            })
            .sort((a, b) => {
                if (b.wins !== a.wins) return b.wins - a.wins;
                return b.totalPoints - a.totalPoints;
            });

        // Analyze transactions
        const playerTransactions = {};
        const managerTransactions = {};
        const managerTrades = {};
        const trades = [];

        transactions.forEach(transaction => {
            if (!transaction.adds && !transaction.drops) return;

            const creator = transaction.creator;
            managerTransactions[creator] = (managerTransactions[creator] || 0) + 1;

            // Identify trades (have roster_ids array with 2+ participants)
            if (transaction.type === 'trade' && transaction.roster_ids && transaction.roster_ids.length >= 2) {
                trades.push(transaction);

                // Count trades per manager
                transaction.roster_ids.forEach(rosterId => {
                    const roster = rosters.find(r => r.roster_id === rosterId);
                    if (roster) {
                        const ownerId = roster.owner_id;
                        managerTrades[ownerId] = (managerTrades[ownerId] || 0) + 1;
                    }
                });
            }

            // Count adds
            if (transaction.adds) {
                Object.keys(transaction.adds).forEach(playerId => {
                    playerTransactions[playerId] = (playerTransactions[playerId] || 0) + 1;
                });
            }

            // Count drops
            if (transaction.drops) {
                Object.keys(transaction.drops).forEach(playerId => {
                    playerTransactions[playerId] = (playerTransactions[playerId] || 0) + 1;
                });
            }
        });

        // Sort players by transaction count
        const topPlayers = Object.entries(playerTransactions)
            .sort((a, b) => b[1] - a[1])
            .filter(([playerId, count]) => playersData[playerId].position != "DEF")
            .slice(0, NUM_TRANSACTED_PLAYERS)
            .map(([playerId, count]) => {
                const player = playersData[playerId] || {};
                return {
                    name: player.full_name || `Player ${playerId}`,
                    position: player.position || 'N/A',
                    team: player.team || '',
                    count
                };
            });

        // Sort managers by transaction count - get top 3
        const topManagers = Object.entries(managerTransactions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([userId, count]) => ({
                name: userMap[userId] || 'Unknown',
                count
            }));

        // Sort managers by trades completed
        const topTraders = Object.entries(managerTrades)
            .sort((a, b) => b[1] - a[1])
            .map(([userId, count]) => ({
                name: userMap[userId] || 'Unknown',
                count
            }));

        // Analyze trades for lopsidedness
        const analyzedTrades = trades.map(trade => {
            const tradeWeek = trade.leg || trade.week || 1;
            const sides = {};

            // Group players by roster_id
            trade.roster_ids.forEach(rosterId => {
                sides[rosterId] = { adds: [], drops: [], totalValue: 0 };
            });

            // Process adds (what each team received)
            if (trade.adds) {
                Object.entries(trade.adds).forEach(([playerId, rosterId]) => {
                    const player = playersData[playerId] || {};
                    const playerWeeklyStats = statsData[playerId] || {};

                    // Calculate median points after trade week
                    const weeklyScores = [];
                    for (let week = tradeWeek + 1; week <= 18; week++) {
                        const weekKey = `week_${week}`;
                        if (playerWeeklyStats[weekKey]) {
                            const weekStats = playerWeeklyStats[weekKey];
                            // Try different scoring fields
                            const score = weekStats.pts_ppr || weekStats.pts_half_ppr || weekStats.pts_std || 0;
                            if (score > 0) {
                                weeklyScores.push(score);
                            }
                        }
                    }

                    const medianScore = weeklyScores.length > 0 ? median(weeklyScores) : 0;
                    const totalScore = weeklyScores.length > 0 ? total(weeklyScores) : 0;

                    sides[rosterId].adds.push({
                        name: player.full_name || `Player ${playerId}`,
                        position: player.position || 'N/A',
                        totalScore: totalScore,
                        medianScore: medianScore,
                        gamesPlayed: weeklyScores.length
                    });
                    sides[rosterId].totalValue += medianScore;
                });
            }

            // Get team names
            const sideArray = Object.entries(sides).map(([rosterId, data]) => {
                const roster = rosters.find(r => r.roster_id === parseInt(rosterId));
                const ownerName = roster ? (userMap[roster.owner_id] || 'Unknown') : 'Unknown';
                return { ...data, rosterId, ownerName };
            });

            // Calculate lopsidedness
            if (sideArray.length === 2) {
                const diff = Math.abs(sideArray[0].totalValue - sideArray[1].totalValue);
                const avg = (sideArray[0].totalValue + sideArray[1].totalValue) / 2;
                const lopsidedness = avg > 0 ? (diff / avg) * 100 : 0;

                return {
                    sides: sideArray,
                    lopsidedness: lopsidedness,
                    week: tradeWeek
                };
            }

            return null;
        }).filter(t => t !== null);

        // Sort by lopsidedness and get top 5
        const lopsidedTrades = analyzedTrades
            .filter((a) => {
              return a.sides[0].adds.length != 0 && a.sides[1].adds.length != 0 && a.lopsidedness != 0
            })
            .sort((a, b) => b.lopsidedness - a.lopsidedness)
            .slice(0, NUM_LOPSIDED_TRADES);

        html += `
            <div class="league-card">
                <div class="league-header">
                    <div class="league-name">${league.name}</div>
                </div>

                <div class="league-info">
                    <div class="info-item">
                        <div class="info-label">Season</div>
                        <div class="info-value">${league.season}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Teams</div>
                        <div class="info-value">${league.total_rosters}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Status</div>
                        <div class="info-value">${league.status}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Scoring</div>
                        <div class="info-value">${league.scoring_settings.rec || 0} PPR</div>
                    </div>
                </div>

                <div class="standings">
                    <div class="standings-title">Standings</div>
                    <div class="roster-list">
                        ${sortedRosters.map((roster, index) => `
                            <div class="roster-item ${index < 3 ? 'top-3' : ''}">
                                <div class="roster-rank">${index + 1}</div>
                                <div class="roster-name">${roster.ownerName}</div>
                                <div class="roster-record">${roster.wins}-${roster.losses}${roster.ties > 0 ? `-${roster.ties}` : ''}</div>
                                <div class="roster-points">${roster.totalPoints.toFixed(2)} pts</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="transactions-section">
                    ${topManagers.length > 0 ? `
                        <div class="section-title manager">Most Active Managers</div>
                        <div class="top-managers">
                            ${topManagers.map((manager, index) => `
                                <div class="manager-rank-card rank-${index + 1}">
                                    <div class="manager-rank">#${index + 1}</div>
                                    <div class="manager-name">${manager.name}</div>
                                    <div class="transaction-count">${manager.count}</div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    ${topTraders.length > 0 ? `
                        <div class="section-title trade-leaders">Trade Leaders</div>
                        <div class="trade-leaders-list">
                            ${topTraders.map((trader, index) => `
                                <div class="trade-leader-item">
                                    <div class="trade-leader-rank">#${index + 1}</div>
                                    <div class="trade-leader-info">
                                        <div class="trade-leader-name">${trader.name}</div>
                                    </div>
                                    <div class="trade-count">${trader.count} ${trader.count === 1 ? 'trade' : 'trades'}</div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    ${lopsidedTrades.length > 0 ? `
                        <div class="section-title trades">Most Lopsided Trades</div>
                        ${lopsidedTrades.map(trade => {
                            const winner = trade.sides[0].totalValue > trade.sides[1].totalValue ? trade.sides[0] : trade.sides[1];
                            const loser = trade.sides[0].totalValue > trade.sides[1].totalValue ? trade.sides[1] : trade.sides[0];

                            return `
                                <div class="trade-card">
                                    <div class="trade-header">
                                        <span>Week ${trade.week}</span>
                                        <span class="lopsided-badge">${trade.lopsidedness.toFixed(0)}% Lopsided</span>
                                    </div>
                                    <div class="trade-teams">
                                        <div class="trade-side">
                                            <div class="trade-side-title">
                                                ${winner.ownerName}
                                                <span class="winner-badge">Winner</span>
                                            </div>
                                            ${winner.adds.map(player => `
                                                <div class="trade-player">
                                                    <span>${player.name} (${player.position})</span>
                                                    <span class="trade-value">${player.medianScore.toFixed(1)} ppg${player.gamesPlayed > 0 ? ` (${player.gamesPlayed}g)` : ''}</span>
                                                </div>
                                            `).join('')}
                                            <div style="margin-top: 10px; font-weight: 600; color: #51cf66;">
                                                Total: ${winner.totalValue.toFixed(1)} ppg
                                            </div>
                                        </div>
                                        <div class="trade-arrow">⇄</div>
                                        <div class="trade-side">
                                            <div class="trade-side-title">${loser.ownerName}</div>
                                            ${loser.adds.map(player => `
                                                <div class="trade-player">
                                                    <span>${player.name} (${player.position})</span>
                                                    <span class="trade-value">${player.medianScore.toFixed(1)} ppg${player.gamesPlayed > 0 ? ` (${player.gamesPlayed}g)` : ''}</span>
                                                </div>
                                            `).join('')}
                                            <div style="margin-top: 10px; font-weight: 600; color: #ff6b6b;">
                                                Total: ${loser.totalValue.toFixed(1)} ppg
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    ` : ''}

                    ${topPlayers.length > 0 ? `
                        <div class="section-title players">Most Transacted Players</div>
                        <div class="transaction-grid">
                            <div class="transaction-card">
                                ${topPlayers.slice(0, NUM_TRANSACTED_PLAYERS / 2).map(player => `
                                    <div class="player-item">
                                        <div class="player-info">
                                            <div class="player-name">${player.name}</div>
                                            <div class="player-position">${player.position}${player.team ? ` - ${player.team}` : ''}</div>
                                        </div>
                                        <div class="transaction-count">${player.count}</div>
                                    </div>
                                `).join('')}
                            </div>
                            ${topPlayers.length > 5 ? `
                                <div class="transaction-card">
                                    ${topPlayers.slice(NUM_TRANSACTED_PLAYERS / 2, NUM_TRANSACTED_PLAYERS).map(player => `
                                        <div class="player-item">
                                            <div class="player-info">
                                                <div class="player-name">${player.name}</div>
                                                <div class="player-position">${player.position}${player.team ? ` - ${player.team}` : ''}</div>
                                            </div>
                                            <div class="transaction-count">${player.count}</div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    document.getElementById('content').innerHTML = html;
}

// Helper function to calculate median
function median(values) {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function total(values) {
  if (values.length === 0) return 0;
  const sum = values.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
  return sum;
}

// Fetch data on load
init();