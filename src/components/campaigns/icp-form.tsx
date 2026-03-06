"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function IcpForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="icp">ICP Description</Label>
      <Textarea
        id="icp"
        name="icp_description"
        placeholder="Describe your ideal customer profile..."
        defaultValue={defaultValue}
      />
    </div>
  );
}
