"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function MailboxMultiSelect({
  accounts,
}: {
  accounts: Array<{ id: string; gmail_address: string }>;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (accountId: string) => {
    setSelected((prev) =>
      prev.includes(accountId)
        ? prev.filter((value) => value !== accountId)
        : [...prev, accountId],
    );
  };

  return (
    <div className="space-y-2">
      {selected.map((accountId) => (
        <input key={accountId} type="hidden" name="account_ids" value={accountId} />
      ))}
      {accounts.map((account) => (
        <Label key={account.id} className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={selected.includes(account.id)}
            onCheckedChange={() => toggle(account.id)}
          />
          {account.gmail_address}
        </Label>
      ))}
    </div>
  );
}
