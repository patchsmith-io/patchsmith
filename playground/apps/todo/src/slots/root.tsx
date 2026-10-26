import { ClientProvider, defineRoute, Route } from "patchsmith/client";

const Shell = () => (
  <ClientProvider>
    <Route />
  </ClientProvider>
);

export default defineRoute({ shellComponent: Shell });
