import { useId, useState, type ReactNode } from "react";
import clsx from "clsx";
import { If } from "../common/If";
import { sectionEmptyText, sectionLabel, type SectionKey } from "../../metrics/logSections";
import css from "./LogSection.module.css";

export interface LogSectionProps {
  section: SectionKey;
  // Number of rows the caller is passing as children. Rendered in the header
  // and used to pick the empty state, so it must match the children count.
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

// One frequency accordion on the Metrics Data Entry Log.
//
// Collapsed content unmounts rather than hiding under CSS: a section can
// hold many live inputs, and keeping them mounted would leave them in the
// tab order while invisible.
export function LogSection({ section, count, defaultOpen, children }: LogSectionProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const regionId = useId();

  return (
    <section className={css.section}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{sectionLabel(section)}</span>
        <span className={css.count}>
          ({count} {count === 1 ? "metric" : "metrics"})
        </span>
        <svg
          className={clsx(css.chevron, open && css.chevronOpen)}
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <div id={regionId}>
        <If condition={open}>
          <If condition={count === 0}>
            <p className={css.empty}>{sectionEmptyText(section)}</p>
          </If>
          <If condition={count > 0}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th scope="col">Summary</th>
                  <th scope="col">Metric</th>
                  <th scope="col">
                    <div className={css.recordHeaderLabel}>Record</div>
                  </th>
                </tr>
              </thead>
              <tbody>{children}</tbody>
            </table>
          </If>
        </If>
      </div>
    </section>
  );
}
