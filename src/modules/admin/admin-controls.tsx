"use client";

import { useRef, useState, useTransition } from "react";
import { createUser, deleteUser } from "./actions";

const inputClass =
  "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 shadow-sm focus:border-stone-500 focus:outline-none";

export function CreateUserForm() {
  const [result, setResult] = useState<{ error?: string; ok?: boolean }>();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) =>
        startTransition(async () => {
          const res = await createUser(formData);
          setResult(res);
          if (res?.ok) formRef.current?.reset();
        })
      }
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-name" className="block text-sm font-medium">
            Name
          </label>
          <input id="new-name" name="name" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="new-email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="new-email"
            name="email"
            type="email"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium">
            Initial password
          </label>
          <input
            id="new-password"
            name="password"
            type="text"
            required
            minLength={8}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="new-role" className="block text-sm font-medium">
            Role
          </label>
          <select id="new-role" name="role" className={inputClass}>
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
      </div>
      {result?.error && (
        <p className="text-sm text-red-600" role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && <p className="text-sm text-green-700">User created.</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-stone-900 px-4 py-2 font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}

export function DeleteUserButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm(`Delete ${userName}? Their uploads are removed too.`))
          return;
        startTransition(async () => {
          await deleteUser(userId);
        });
      }}
      className="text-sm text-red-600 hover:underline disabled:opacity-50"
    >
      Delete
    </button>
  );
}
