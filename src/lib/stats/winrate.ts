/** Intervalle de Wilson à 95 %, sans approximation normale aux taux extrêmes. */
export function winrateEstimate(wins: number, games: number) {
	if (!Number.isSafeInteger(games) || !Number.isSafeInteger(wins) || games < 0 || wins < 0 || wins > games) {
		throw new RangeError('Winrate requires integer counts with 0 <= wins <= games.');
	}
	if (games === 0) return null;
	const rate = wins / games;
	const z = 1.959963984540054;
	const zSquared = z * z;
	const denominator = 1 + zSquared / games;
	const center = (rate + zSquared / (2 * games)) / denominator;
	const radius = z * Math.sqrt(rate * (1 - rate) / games + zSquared / (4 * games * games)) / denominator;
	return { rate, lower: Math.max(0, center - radius), upper: Math.min(1, center + radius) };
}
