"use client";
import React from "react";
import { Analytics } from "@vercel/analytics/react";

export default function AnalyticsClient({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return <Analytics />;
}
