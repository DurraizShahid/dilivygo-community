/** @type {import("syncpack").RcFile} */
module.exports = {
  versionGroups: [
    {
      label: "Workspace @dilivygo/* — npm workspaces resolve * to local packages",
      dependencies: ["@dilivygo/**"],
      dependencyTypes: ["dev", "prod", "peer"],
      isIgnored: true,
    },
  ],
};
