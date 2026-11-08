interface SummonerSpell {
	name: string;
	icon: string;
}

const spells: Record<number, SummonerSpell> = {
	1: { name: 'Purge', icon: 'SummonerBoost.png' },
	3: { name: 'Fatigue', icon: 'SummonerExhaust.png' },
	4: { name: 'Saut éclair', icon: 'SummonerFlash.png' },
	6: { name: 'Fantôme', icon: 'SummonerHaste.png' },
	7: { name: 'Soin', icon: 'SummonerHeal.png' },
	11: { name: 'Châtiment', icon: 'SummonerSmite.png' },
	12: { name: 'Téléportation', icon: 'SummonerTeleport.png' },
	13: { name: 'Clarté', icon: 'summonermana.png' },
	14: { name: 'Embrasement', icon: 'SummonerDot.png' },
	21: { name: 'Barrière', icon: 'summonerbarrier.png' },
	32: { name: 'Marquage', icon: 'SummonerSnowball.png' },
	39: { name: 'Retour', icon: 'summoner_backtrack.png' },
};

export function summonerSpell(id: number | null): SummonerSpell | null {
	return id === null ? null : spells[id] ?? null;
}
