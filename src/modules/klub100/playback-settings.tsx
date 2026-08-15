"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import {
  btnPrimary,
  btnSecondary,
  card,
  errorText,
  linkDanger,
  okText,
} from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { CheersCapture } from "./cheers-recorder";
import {
  attachDefaultCheers,
  removeDefaultCheers,
  updateFades,
} from "./actions";
import { DEFAULT_FADE_MS, FADE_STEP_MS, MAX_FADE_MS } from "./shared";

export type DefaultCheersView = {
  url: string;
  recordedByName: string;
} | null;

/**
 * Curator-only playback settings for a project: the default cheers played
 * before songs that have none of their own, and the fade in/out around every
 * song segment.
 */
export function PlaybackSettings({
  projectId,
  defaultCheers,
  fadeInMs,
  fadeOutMs,
}: {
  projectId: string;
  defaultCheers: DefaultCheersView;
  fadeInMs: number;
  fadeOutMs: number;
}) {
  const { t } = useI18n();

  return (
    <div>
      <h2 className="text-xl font-semibold text-white">
        {t.klub100.playbackSettings}
      </h2>
      <p className="mb-3 mt-1 text-sm text-zinc-400">
        {t.klub100.playbackSettingsHint}
      </p>
      <div className="space-y-3">
        <DefaultCheersCard projectId={projectId} defaultCheers={defaultCheers} />
        <FadeCard
          projectId={projectId}
          fadeInMs={fadeInMs}
          fadeOutMs={fadeOutMs}
        />
      </div>
    </div>
  );
}

function DefaultCheersCard({
  projectId,
  defaultCheers,
}: {
  projectId: string;
  defaultCheers: DefaultCheersView;
}) {
  const { t, fmt } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const save = () => {
    if (!file) return;
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("file", file);
    startTransition(async () => {
      const result = await attachDefaultCheers(formData);
      setError(result?.error);
      if (result?.ok) setFile(null);
    });
  };

  const remove = () => {
    if (!confirm(t.klub100.confirmRemoveDefaultCheers)) return;
    startTransition(async () => {
      const result = await removeDefaultCheers(projectId);
      setError(result?.error);
    });
  };

  return (
    <section className={`${card} p-4 sm:p-5`}>
      <h3 className="font-semibold text-zinc-100">
        {t.klub100.defaultCheersTitle}
      </h3>
      <p className="mt-1 text-sm text-zinc-400">
        {defaultCheers
          ? fmt(t.klub100.defaultCheersRecordedBy, {
              name: defaultCheers.recordedByName,
            })
          : t.klub100.defaultCheersNoneYet}
      </p>

      {defaultCheers && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <audio src={defaultCheers.url} controls className="h-10 max-w-full" />
          <button
            type="button"
            disabled={isPending}
            onClick={remove}
            className={linkDanger}
          >
            {t.klub100.removeDefaultCheers}
          </button>
        </div>
      )}

      <div className="mt-4">
        <CheersCapture value={file} onChange={setFile} />
      </div>

      {error && (
        <p className={`${errorText} mt-2`} role="alert">
          {error}
        </p>
      )}

      <div className="mt-3">
        <button
          type="button"
          disabled={!file || isPending}
          onClick={save}
          className={btnPrimary}
        >
          {isPending ? t.common.saving : t.klub100.saveDefaultCheers}
        </button>
      </div>
    </section>
  );
}

function FadeCard({
  projectId,
  fadeInMs,
  fadeOutMs,
}: {
  projectId: string;
  fadeInMs: number;
  fadeOutMs: number;
}) {
  const { t } = useI18n();
  const [fadeIn, setFadeIn] = useState(fadeInMs);
  const [fadeOut, setFadeOut] = useState(fadeOutMs);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty = fadeIn !== fadeInMs || fadeOut !== fadeOutMs;
  const isDefault =
    fadeIn === DEFAULT_FADE_MS && fadeOut === DEFAULT_FADE_MS;

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      const result = await updateFades({
        projectId,
        fadeInMs: fadeIn,
        fadeOutMs: fadeOut,
      });
      setError(result?.error);
      setSaved(Boolean(result?.ok));
    });
  };

  return (
    <section className={`${card} p-4 sm:p-5`}>
      <h3 className="font-semibold text-zinc-100">{t.klub100.fadesTitle}</h3>
      <p className="mt-1 text-sm text-zinc-400">{t.klub100.fadesHint}</p>

      <div className="mt-4 space-y-4">
        <FadeSlider
          label={t.klub100.fadeIn}
          value={fadeIn}
          onChange={(ms) => {
            setSaved(false);
            setFadeIn(ms);
          }}
        />
        <FadeSlider
          label={t.klub100.fadeOut}
          value={fadeOut}
          onChange={(ms) => {
            setSaved(false);
            setFadeOut(ms);
          }}
        />
      </div>

      {error && (
        <p className={`${errorText} mt-3`} role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!dirty || isPending}
          onClick={save}
          className={btnPrimary}
        >
          {isPending ? t.common.saving : t.klub100.saveFades}
        </button>
        {!isDefault && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setSaved(false);
              setFadeIn(DEFAULT_FADE_MS);
              setFadeOut(DEFAULT_FADE_MS);
            }}
            className={btnSecondary}
          >
            {t.klub100.resetFades}
          </button>
        )}
        {saved && !dirty && (
          <span className={`inline-flex items-center gap-1.5 ${okText}`}>
            <CheckIcon className="h-4 w-4" />
            {t.common.saved}
          </span>
        )}
      </div>
    </section>
  );
}

function FadeSlider({
  label: sliderLabel,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (ms: number) => void;
}) {
  const { t, fmt } = useI18n();

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-zinc-300">{sliderLabel}</span>
        <span className="text-sm tabular-nums text-amber-300">
          {value === 0
            ? t.klub100.fadeOff
            : fmt(t.klub100.fadeSeconds, {
                seconds: (value / 1000).toFixed(1),
              })}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={MAX_FADE_MS}
        step={FADE_STEP_MS}
        value={value}
        aria-label={sliderLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-11 w-full cursor-pointer accent-amber-400"
      />
    </div>
  );
}
