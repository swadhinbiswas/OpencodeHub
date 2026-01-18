/**
 * Inbox Keyboard Shortcuts
 * Graphite-style keyboard navigation for PR inbox
 */

// Keyboard shortcut handler
export function initInboxKeyboardShortcuts() {
    let selectedIndex = 0;
    const prItems = document.querySelectorAll('[data-pr-item]');

    if (prItems.length === 0) return;

    // Highlight the first item
    const highlightPR = (index: number) => {
        prItems.forEach((item, i) => {
            if (i === index) {
                item.classList.add('ring-2', 'ring-primary', 'bg-primary/5');
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('ring-2', 'ring-primary', 'bg-primary/5');
            }
        });
    };

    // Initialize
    highlightPR(0);

    // Add keyboard listener
    document.addEventListener('keydown', (e) => {
        // Don't trigger if user is typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'j': // Next PR
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, prItems.length - 1);
                highlightPR(selectedIndex);
                break;

            case 'k': // Previous PR
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                highlightPR(selectedIndex);
                break;

            case 'o': // Open PR
            case 'enter':
                e.preventDefault();
                const selectedItem = prItems[selectedIndex] as HTMLAnchorElement;
                selectedItem?.click();
                break;

            case 'r': // Refresh
                e.preventDefault();
                window.location.reload();
                break;

            case '?': // Show help
                e.preventDefault();
                toggleHelpModal();
                break;

            case 'escape':
                e.preventDefault();
                closeHelpModal();
                break;
        }
    });

    // Help modal
    function toggleHelpModal() {
        const modal = document.getElementById('keyboard-shortcuts-modal');
        if (modal) {
            modal.classList.toggle('hidden');
        }
    }

    function closeHelpModal() {
        const modal = document.getElementById('keyboard-shortcuts-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    console.log('✅ Inbox keyboard shortcuts active');
}

// Auto-init on page load
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initInboxKeyboardShortcuts);
}
