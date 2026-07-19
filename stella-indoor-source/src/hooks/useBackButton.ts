import { useState, useEffect } from 'react';

/**
 * useBackButton — Intercepts the hardware back button / browser back
 * to navigate backwards through wizard steps before exiting.
 *
 * Flow: Addons (3) ← Time (2) ← Court (1) ← Home ← Exit
 */
export function useBackButton(
  isLoggedIn: boolean,
  isHomePage: boolean,
  currentStep: number,       // 1-5 for wizard steps
  wizardActive: boolean,      // true when user is in booking wizard
  onGoHome: () => void,       // go to home page
  onStepBack: () => void,     // go one step back in wizard
  onLogout: () => void
) {
  const [exitPrompt, setExitPrompt] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      // Wizard is active — navigate backward through steps (guests included, K-18/D4:
      // the guest deep-link wizard must also step back instead of exiting).
      if (wizardActive && currentStep > 1) {
        onStepBack();
        // Re-push a state so the next back also triggers popstate
        window.history.pushState({ stellaStep: currentStep - 1 }, '', '');
        return;
      }

      // Wizard at step 1 — logged-in users go back to the home page; a GUEST has no
      // authed home, so Back is left to exit the app (not trapped).
      if (wizardActive && currentStep === 1) {
        if (isLoggedIn) {
          onGoHome();
          window.history.pushState({ stellaStep: 0 }, '', '');
        }
        return;
      }

      // Everything below is for signed-in users only.
      if (!isLoggedIn) return;

      // On home page — first back = exit prompt, second back = logout
      if (isHomePage) {
        if (exitPrompt) {
          onLogout();
          return;
        }
        setExitPrompt(true);
        setTimeout(() => setExitPrompt(false), 2000);
        window.history.pushState({ stellaStep: 0 }, '', '');
        return;
      }

      // Not on home page and not in wizard — go home
      onGoHome();
      window.history.pushState({ stellaStep: 0 }, '', '');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isLoggedIn, isHomePage, currentStep, wizardActive, onGoHome, onStepBack, onLogout, exitPrompt]);

  return { exitPrompt };
}

/**
 * Push a history state when advancing a wizard step.
 * Call this each time the user goes to the next step.
 */
export function pushWizardStep(step: number) {
  window.history.pushState({ stellaStep: step }, '', '');
}
