import { championIcon, championName } from '../../lib/lol';

interface IconProps {
	name: string;
	class?: string;
}

export function DraftIcon({ name, class: className }: IconProps) {
	const src = `/opgg/svg/${name}.svg`;
	return <span aria-hidden="true" class={['inline-block shrink-0 bg-current', className].filter(Boolean).join(' ')}
		style={`mask: url("${src}") center / contain no-repeat; -webkit-mask: url("${src}") center / contain no-repeat;`} />;
}

interface ChampionIconProps {
	champion: string;
	size: 'sm' | 'md' | 'xl';
	tip?: string | false;
	class?: string;
}

export function DraftChampionIcon({ champion, size, tip, class: className }: ChampionIconProps) {
	const name = championName(champion);
	const sizeClass = size === 'sm' ? 'size-7 text-[0.625rem]' : size === 'xl' ? 'size-20 text-base' : 'size-10 text-xs';
	return (
		<span
			class={['relative inline-grid shrink-0 place-items-center overflow-hidden border bg-night-800 font-display font-bold text-muted',
				sizeClass, 'border-gold-700', className].filter(Boolean).join(' ')}
			data-tip-title={tip === false ? undefined : name}
			data-tip={tip || undefined}
		>
			<span aria-hidden="true">{name.slice(0, 2)}</span>
			<img src={championIcon(champion)} alt={name} width="120" height="120" loading="lazy" decoding="async"
				class="absolute inset-0 size-full scale-110 object-cover" />
		</span>
	);
}
