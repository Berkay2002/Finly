import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Reminders are timed to the minute on the device; 15 minutes is the slack the person will notice least.
crons.interval("send push reminders", { minutes: 15 }, internal.pushSend.run, {});

export default crons;
