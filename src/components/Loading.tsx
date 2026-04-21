import common from "./common.module.css";
import css from "./Loading.module.css";

export function Loading() {
  return (
    <div className={common.centered}>
      <p className={css.text}>Loading...</p>
    </div>
  );
}
