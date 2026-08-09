import React, { useEffect, useState } from 'react';
import { Settings, Cpu, ShieldCheck, Sliders, Info, Database } from 'lucide-react';
import type { ProviderStatus, ServerSettings, Timeframe } from '../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Badge } from './ui/badge';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ServerSettings;
  providers: ProviderStatus[];
  onSave: (patch: Partial<ServerSettings>) => Promise<void>;
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-semibold text-foreground flex items-center justify-between">
        <span>{label}</span>
        {suffix && <span className="text-[10px] text-muted-foreground font-normal">{suffix}</span>}
      </label>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          onChange(Number.isFinite(parsed) ? parsed : min);
        }}
        className="font-mono bg-background border-border"
      />
      {hint && <p className="text-[10px] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  providers,
  onSave,
}) => {
  const [form, setForm] = useState<ServerSettings>(settings);
  const [saving, setSaving] = useState(false);

  // Re-sync on open so the form never shows stale values.
  useEffect(() => {
    if (isOpen) setForm(settings);
  }, [isOpen, settings]);

  const patch = (p: Partial<ServerSettings>) => setForm((prev) => ({ ...prev, ...p }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card border-border text-card-foreground p-6 max-h-[90vh] overflow-y-auto overscroll-contain scrollbar-subtle">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-foreground" />
            <DialogTitle className="text-xl font-bold">Settings</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            These preferences control how strict the advice is before a setup is called worth taking.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="advice" className="w-full my-2">
          <TabsList className="grid grid-cols-3 bg-muted border-border">
            <TabsTrigger value="advice" className="text-xs gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Advice
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs gap-1.5">
              <Cpu className="h-3.5 w-3.5" /> AI
            </TabsTrigger>
            <TabsTrigger value="sources" className="text-xs gap-1.5">
              <Database className="h-3.5 w-3.5" /> Sources
            </TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------- ADVICE */}
          <TabsContent value="advice" className="space-y-4 pt-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Minimum signal quality"
                suffix="%"
                value={form.minSignalQuality}
                onChange={(v) => patch({ minSignalQuality: v })}
                min={0}
                max={100}
                hint="Below this the verdict becomes AVOID. Higher means fewer but stronger signals."
              />
              <NumberField
                label="Minimum risk / reward"
                value={form.minRiskReward}
                onChange={(v) => patch({ minRiskReward: v })}
                min={0.1}
                max={100}
                step={0.1}
                hint="1.5 means the target must be at least 1.5x the distance to the stop."
              />
              <NumberField
                label="Risk per trade"
                suffix="% of account"
                value={form.accountRiskPercent}
                onChange={(v) => patch({ accountRiskPercent: v })}
                min={0.1}
                max={100}
                step={0.1}
                hint="Used to suggest a position size as a percentage. 1-2% is the common guidance."
              />
              <NumberField
                label="Overtrading warning after"
                suffix="signals/day"
                value={form.maxSignalsPerDay}
                onChange={(v) => patch({ maxSignalsPerDay: v })}
                min={1}
                max={500}
                hint="A reminder appears once you exceed this many analyses in a day."
              />
              <NumberField
                label="Cooldown per market"
                suffix="minutes"
                value={form.cooldownMinutes}
                onChange={(v) => patch({ cooldownMinutes: v })}
                min={0}
                max={1440}
                hint="Warns if you follow another signal on the same market too soon. 0 disables it."
              />
              <NumberField
                label="Maximum price age"
                suffix="seconds"
                value={form.maxMarketDataAgeSeconds}
                onChange={(v) => patch({ maxMarketDataAgeSeconds: v })}
                min={5}
                max={3600}
                hint="Older data fails the freshness check."
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Default timeframe</label>
              <div className="flex flex-wrap gap-1.5">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => patch({ defaultTimeframe: tf })}
                    className={`px-2.5 py-1 rounded-md border text-[11px] font-mono font-semibold ${
                      form.defaultTimeframe === tf
                        ? 'border-primary/50 bg-primary/15 text-primary'
                        : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-muted/50 p-3 rounded-xl border border-border flex items-center justify-between">
              <div>
                <span className="font-bold text-sm block">Require a stop loss</span>
                <span className="text-muted-foreground text-[11px]">
                  Mark any signal without a stop loss as AVOID.
                </span>
              </div>
              <Switch
                checked={form.requireStopLoss}
                onCheckedChange={(checked) => patch({ requireStopLoss: checked })}
              />
            </div>
          </TabsContent>

          {/* -------------------------------------------------------------- AI */}
          <TabsContent value="ai" className="space-y-4 pt-3 text-xs">
            <div className="p-3 bg-muted/60 rounded-lg border border-border text-[11px] flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                The AI service is provided and paid for by the operator of this application. You do
                not need an API key, and no key is ever stored in your browser.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Model</label>
              <Input
                type="text"
                value={form.aiModel}
                onChange={(e) => patch({ aiModel: e.target.value })}
                className="font-mono bg-background border-border"
              />
              <p className="text-[10px] text-muted-foreground">
                Must be a model available to the configured service account.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex justify-between items-center">
                <label className="font-semibold text-foreground">Temperature</label>
                <span className="font-mono text-emerald-500 font-bold">
                  {form.aiTemperature.toFixed(2)}
                </span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={[form.aiTemperature]}
                onValueChange={([v]) => patch({ aiTemperature: v })}
              />
              <p className="text-[11px] text-muted-foreground">
                Lower values give more consistent, conservative analysis. 0.1–0.3 is recommended.
              </p>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg border border-border text-[11px] text-muted-foreground">
              The AI never calculates indicators and never decides anything on its own. This
              application computes every indicator from real market data, and a separate rule-based
              layer produces the final verdict — which can and does overrule the AI.
            </div>
          </TabsContent>

          {/* --------------------------------------------------------- SOURCES */}
          <TabsContent value="sources" className="space-y-3 pt-3 text-xs">
            <p className="text-[11px] text-muted-foreground">
              Markets are searched across every available source. A source that is unavailable is
              simply excluded — its data is never substituted or estimated.
            </p>

            {providers.map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{p.label}</span>
                    {p.supportsStreaming && (
                      <Badge variant="outline" className="text-[9px] py-0 border-border text-muted-foreground">
                        LIVE
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {p.assetClasses.join(' · ')}
                  </p>
                  {!p.available && p.reason && (
                    <p className="text-[10px] text-amber-500 mt-1">{p.reason}</p>
                  )}
                </div>
                <Badge variant={p.available ? 'buy' : 'outline'} className="text-[10px] shrink-0">
                  {p.available ? 'AVAILABLE' : 'UNAVAILABLE'}
                </Badge>
              </div>
            ))}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-border">
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-500 font-bold text-white"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
