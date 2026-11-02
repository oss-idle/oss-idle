import Synced from '@oss-idle/shared/helpers/synced';

/** A build for the PBE, where players get its tools. Any other build drops them at compile time. */
export const PBE = import.meta.env.VITE_PBE === '1';

/** Every play ends as soon as it starts. The server holds it, with the other queue preferences. */
export const autoSkip = new Synced(false);
