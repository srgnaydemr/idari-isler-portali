"use client";

import { useEffect } from "react";

/**
 * Portal genelinde normal HTML ve Server Action formlarında çift gönderimi engeller.
 * İlk submit'te formu "işleniyor" durumuna alır; ikinci submit isteğini iptal eder.
 * Submitter devre dışı bırakılmaz; böylece name/value kullanan butonlar (örn. tema reset)
 * FormData içine doğru şekilde girmeye devam eder.
 */
export function FormSubmitGuard() {
  useEffect(() => {
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || form.dataset.allowDuplicateSubmit === "1") return;

      if (form.dataset.submitting === "1") {
        event.preventDefault();
        return;
      }

      form.dataset.submitting = "1";
      form.setAttribute("aria-busy", "true");
      const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
      if (submitter) {
        submitter.classList.add("is-submitting");
        submitter.setAttribute("aria-disabled", "true");
        if (submitter instanceof HTMLButtonElement) {
          submitter.dataset.originalText = submitter.textContent || "";
          submitter.textContent = "İşleniyor…";
        }
      }

      // Eğer tarayıcı/native validation sonrasında gerçek navigasyon oluşmazsa form kilitli kalmasın.
      window.setTimeout(() => {
        if (!document.contains(form)) return;
        form.dataset.submitting = "0";
        form.removeAttribute("aria-busy");
        if (submitter) {
          submitter.classList.remove("is-submitting");
          submitter.removeAttribute("aria-disabled");
          if (submitter instanceof HTMLButtonElement && submitter.dataset.originalText) {
            submitter.textContent = submitter.dataset.originalText;
          }
        }
      }, 15000);
    };

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  return null;
}
