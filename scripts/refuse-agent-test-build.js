// Agent access test builds (WXT_PM_AGENT_TEST, see wxt.config.js) allow every agent
// pairing request without asking the user: never zip or submit one
if (process.env.WXT_PM_AGENT_TEST !== undefined) {
    console.error(
        "WXT_PM_AGENT_TEST is set: refusing to zip or submit an Agent access test build. Unset it and run the command again.",
    );
    process.exit(1);
}
