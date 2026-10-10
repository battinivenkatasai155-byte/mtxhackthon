import React from "react";
import { Logo } from "./Header.jsx";

export default function Footer() {
  return (
    <footer className="bg-navy text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <Logo light />
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
              GrievanceIQ is a civic grievance management platform for reporting issues and tracking their resolution.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Using GrievanceIQ</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-400">
              <li>Create a citizen account to submit complaints.</li>
              <li>Track every complaint with its ID and status timeline.</li>
              <li>Administration access is for authorised staff only.</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Your data</h3>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Passwords are stored as secure hashes. Citizens can only view their own complaints, and administrator permissions are enforced on the server.
            </p>
          </div>
        </div>
        <div className="mt-10 border-t border-white/10 pt-6 text-xs text-slate-500">
          © 2026 GrievanceIQ.
        </div>
      </div>
    </footer>
  );
}
