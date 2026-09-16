const labels = [
  ["noun", "名词性"],
  ["adjective", "形容词性"],
  ["adverb", "副词性"],
  ["verb", "动词"],
] as const;

export function GrammarLegend() {
  return (
    <ul className="legend" aria-label="颜色说明">
      {labels.map(([type, label]) => (
        <li key={type}>
          <span
            aria-hidden="true"
            className={`legend__swatch segment--${type}`}
          />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
