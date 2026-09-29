const path = require("path");

module.exports = {
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  devServer: (devServerConfig) => {
    devServerConfig.allowedHosts = "all";
    devServerConfig.host = "0.0.0.0";
    return devServerConfig;
  },
};
