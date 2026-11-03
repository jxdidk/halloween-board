/**
 * script.js - Halloween Message Board Client Controller
 * 
 * Features:
 * - Public visitor read-only mode vs Server-authenticated owner mode
 * - Strictly prevents XSS by escaping all user content before rendering
 * - Real-time character counter and localized date/time formatting
 * - Modal workflows for owner login, editing, and confirmation before deletion
 * - Dynamic toxic green firefly spawning
 */

(function () {
  'use strict';

  // State Management
  let isOwner = false;
  let messagesList = [];

  // DOM Elements - Navigation & Auth
  const btnAudioToggle = document.getElementById('btnAudioToggle');
  const soundLabel = document.getElementById('soundLabel');
  const iconMuted = btnAudioToggle?.querySelector('.icon-muted');
  const iconPlaying = btnAudioToggle?.querySelector('.icon-playing');

  const btnOpenOwnerLogin = document.getElementById('btnOpenOwnerLogin');
  const ownerActiveBar = document.getElementById('ownerActiveBar');
  const btnLogout = document.getElementById('btnLogout');

  // DOM Elements - Composer (Owner Only)
  const ownerComposerAltar = document.getElementById('ownerComposerAltar');
  const composeForm = document.getElementById('composeForm');
  const messageInput = document.getElementById('messageInput');
  const charCounter = document.getElementById('charCounter');
  const composeNotice = document.getElementById('composeNotice');
  const btnPublish = document.getElementById('btnPublish');

  // DOM Elements - Feed
  const messagesContainer = document.getElementById('messagesContainer');
  const feedLoader = document.getElementById('feedLoader');
  const emptyFeedState = document.getElementById('emptyFeedState');
  const messageCountBadge = document.getElementById('messageCountBadge');
  const btnRefresh = document.getElementById('btnRefresh');

  // DOM Elements - Modals
  const loginModal = document.getElementById('loginModal');
  const loginForm = document.getElementById('loginForm');
  const adminPasswordInput = document.getElementById('adminPasswordInput');
  const loginAlert = document.getElementById('loginAlert');
  const btnCancelLogin = document.getElementById('btnCancelLogin');

  const editModal = document.getElementById('editModal');
  const editForm = document.getElementById('editForm');
  const editMessageId = document.getElementById('editMessageId');
  const editMessageInput = document.getElementById('editMessageInput');
  const editCharCounter = document.getElementById('editCharCounter');
  const editAlert = document.getElementById('editAlert');
  const btnCancelEdit = document.getElementById('btnCancelEdit');

  const deleteModal = document.getElementById('deleteModal');
  const deleteTargetId = document.getElementById('deleteTargetId');
  const deletePreviewText = document.getElementById('deletePreviewText');
  const btnCancelDelete = document.getElementById('btnCancelDelete');
  const btnConfirmDelete = document.getElementById('btnConfirmDelete');

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  document.addEventListener('DOMContentLoaded', () => {
    initFireflies();
    setupEventListeners();
    // Check if current user has an active owner session cookie
    checkAuthStatus();
    // Fetch and display messages
    fetchMessages();
  });

  /**
   * Spawn toxic green fireflies in the background
   */
  function initFireflies() {
    const container = document.getElementById('fireflies');
    if (!container) return;

    const count = 14;
    for (let i = 0; i < count; i++) {
      const fly = document.createElement('div');
      fly.className = 'firefly';
      fly.style.left = `${Math.random() * 95}%`;
      fly.style.top = `${40 + Math.random() * 55}%`;
      fly.style.animationDelay = `${Math.random() * 7}s`;
      fly.style.animationDuration = `${6 + Math.random() * 6}s`;
      container.appendChild(fly);
    }
  }

  // =========================================================================
  // EVENT LISTENERS SETUP
  // =========================================================================

  function setupEventListeners() {
    // Ambient Sound Toggle
    btnAudioToggle?.addEventListener('click', toggleSound);

    // Refresh Feed
    btnRefresh?.addEventListener('click', () => {
      fetchMessages();
    });

    // Owner Login Modal Controls
    btnOpenOwnerLogin?.addEventListener('click', openLoginModal);
    btnCancelLogin?.addEventListener('click', closeLoginModal);
    loginForm?.addEventListener('submit', handleLoginSubmit);

    // Logout Control
    btnLogout?.addEventListener('click', handleLogout);

    // Composer Input Events
    messageInput?.addEventListener('input', () => {
      if (charCounter) charCounter.textContent = messageInput.value.length;
    });

    composeForm?.addEventListener('submit', handleComposeSubmit);

    // Edit Modal Events
    editMessageInput?.addEventListener('input', () => {
      if (editCharCounter) editCharCounter.textContent = editMessageInput.value.length;
    });
    btnCancelEdit?.addEventListener('click', closeEditModal);
    editForm?.addEventListener('submit', handleEditSubmit);

    // Delete Modal Events
    btnCancelDelete?.addEventListener('click', closeDeleteModal);
    btnConfirmDelete?.addEventListener('click', handleDeleteConfirm);

    // Close modals on backdrop click or ESC key
    [loginModal, editModal, deleteModal].forEach(modal => {
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeAllModals();
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllModals();
      }
    });
  }

  // =========================================================================
  // AMBIENT SOUND
  // =========================================================================

  function toggleSound() {
    if (!window.spookyAudio) return;
    const isPlaying = window.spookyAudio.toggle();

    if (isPlaying) {
      btnAudioToggle?.classList.add('playing');
      if (soundLabel) soundLabel.textContent = 'Sound: ON';
      if (iconMuted) iconMuted.style.display = 'none';
      if (iconPlaying) iconPlaying.style.display = 'block';
    } else {
      btnAudioToggle?.classList.remove('playing');
      if (soundLabel) soundLabel.textContent = 'Sound: OFF';
      if (iconMuted) iconMuted.style.display = 'block';
      if (iconPlaying) iconPlaying.style.display = 'none';
    }
  }

  // =========================================================================
  // AUTHENTICATION & PERMISSIONS
  // =========================================================================

  /**
   * Check whether current visitor has an authenticated owner cookie session
   */
  async function checkAuthStatus() {
    try {
      const res = await fetch('/api/auth/check');
      const data = await res.json();
      isOwner = Boolean(data.authenticated);

      updateOwnerUI();
    } catch (err) {
      console.warn('Could not verify owner status:', err);
      isOwner = false;
      updateOwnerUI();
    }
  }

  /**
   * Toggles UI elements based on owner status.
   * VISITORS NEVER SEE ANY INPUT BOX OR EDIT/DELETE BUTTON.
   */
  function updateOwnerUI() {
    if (isOwner) {
      // Owner Mode Active:
      if (ownerComposerAltar) ownerComposerAltar.style.display = 'block';
      if (ownerActiveBar) ownerActiveBar.style.display = 'flex';
      if (btnOpenOwnerLogin) btnOpenOwnerLogin.style.display = 'none';
    } else {
      // Visitor Mode:
      if (ownerComposerAltar) ownerComposerAltar.style.display = 'none';
      if (ownerActiveBar) ownerActiveBar.style.display = 'none';
      if (btnOpenOwnerLogin) btnOpenOwnerLogin.style.display = 'inline-flex';
    }

    // Refresh message cards to render/un-render owner action buttons
    renderMessages(messagesList);
  }

  function openLoginModal() {
    if (loginAlert) loginAlert.style.display = 'none';
    if (adminPasswordInput) adminPasswordInput.value = '';
    if (loginModal) loginModal.style.display = 'flex';
    setTimeout(() => adminPasswordInput?.focus(), 100);
  }

  function closeLoginModal() {
    if (loginModal) loginModal.style.display = 'none';
    if (adminPasswordInput) adminPasswordInput.value = '';
    if (loginAlert) loginAlert.style.display = 'none';
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    const password = adminPasswordInput.value;

    if (!password) return;

    if (loginAlert) {
      loginAlert.style.display = 'none';
      loginAlert.textContent = '';
    }

    const submitBtn = document.getElementById('btnSubmitLogin');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Unlocking...';
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          // Rate-limited lock
          showLoginError(`🔒 ${data.error} (Retry in ${data.retryAfterSeconds}s)`);
        } else {
          // Failed attempt
          const remainingMsg = data.remainingAttempts !== undefined
            ? ` (${data.remainingAttempts} attempts remaining before crypt seals)`
            : '';
          showLoginError(`⚠️ ${data.error || 'Invalid password.'}${remainingMsg}`);
        }
        return;
      }

      // Success!
      closeLoginModal();
      isOwner = true;
      updateOwnerUI();
      showNotice(data.message || 'Owner Sanctum Unlocked!', 'success');
    } catch (err) {
      showLoginError('Network anomaly. The spirits failed to respond.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Unlock Sanctum';
      }
    }
  }

  function showLoginError(msg) {
    if (loginAlert) {
      loginAlert.textContent = msg;
      loginAlert.style.display = 'block';
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // Ignored
    }

    isOwner = false;
    updateOwnerUI();
    showNotice('You have exited the owner sanctum and returned to mortal view.', 'success');
  }

  // =========================================================================
  // MESSAGE RENDERING & XSS PREVENTION
  // =========================================================================

  /**
   * Escape all HTML characters to strictly prevent Cross-Site Scripting (XSS)
   */
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Format ISO date string into readable multi-locale timestamp
   */
  function formatTimestamp(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat(navigator.language || 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(d);
    } catch (e) {
      return isoString;
    }
  }

  /**
   * Fetch all messages from backend
   */
  async function fetchMessages() {
    if (feedLoader) feedLoader.style.display = 'flex';
    if (emptyFeedState) emptyFeedState.style.display = 'none';

    try {
      const res = await fetch('/api/messages');
      const data = await res.json();

      if (data.success && Array.isArray(data.messages)) {
        messagesList = data.messages;
        renderMessages(messagesList);
      } else {
        throw new Error(data.error || 'Failed to load messages');
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
      if (messagesContainer) {
        messagesContainer.innerHTML = `
          <div class="empty-state">
            <p class="empty-title">⚠️ The Spirits Are Disturbed</p>
            <p class="empty-text">Failed to fetch inscriptions. Please check server connectivity.</p>
          </div>
        `;
      }
    } finally {
      if (feedLoader) feedLoader.style.display = 'none';
    }
  }

  /**
   * Render message cards
   */
  function renderMessages(messages) {
    if (!messagesContainer) return;

    if (messageCountBadge) {
      messageCountBadge.textContent = messages.length;
    }

    if (!messages || messages.length === 0) {
      messagesContainer.innerHTML = '';
      if (emptyFeedState) emptyFeedState.style.display = 'block';
      return;
    }

    if (emptyFeedState) emptyFeedState.style.display = 'none';

    // Clear current container safely
    messagesContainer.innerHTML = '';

    messages.forEach(msg => {
      const card = document.createElement('article');
      card.className = 'message-card';
      card.id = `msg-${msg.id}`;

      // Card Header: Timestamp & Optional Owner Actions
      const cardTop = document.createElement('div');
      cardTop.className = 'card-top';

      const cardMeta = document.createElement('div');
      cardMeta.className = 'card-meta';

      const seal = document.createElement('span');
      seal.className = 'crypt-seal';
      seal.textContent = '🕯️';

      const timeSpan = document.createElement('time');
      timeSpan.className = 'card-time';
      timeSpan.dateTime = msg.created_at;
      timeSpan.textContent = formatTimestamp(msg.created_at);

      cardMeta.appendChild(seal);
      cardMeta.appendChild(timeSpan);

      if (msg.updated_at) {
        const editedTag = document.createElement('span');
        editedTag.className = 'card-edited-tag';
        editedTag.title = `Edited: ${formatTimestamp(msg.updated_at)}`;
        editedTag.textContent = 'Edited';
        cardMeta.appendChild(editedTag);
      }

      cardTop.appendChild(cardMeta);

      // Render Edit and Delete controls ONLY if user is verified owner!
      if (isOwner) {
        const ownerActions = document.createElement('div');
        ownerActions.className = 'card-owner-actions';

        const btnEdit = document.createElement('button');
        btnEdit.className = 'action-icon-btn edit-btn';
        btnEdit.title = 'Edit Inscription';
        btnEdit.innerHTML = '✏️ Edit';
        btnEdit.addEventListener('click', () => openEditModal(msg));

        const btnDelete = document.createElement('button');
        btnDelete.className = 'action-icon-btn delete-btn';
        btnDelete.title = 'Banish Inscription';
        btnDelete.innerHTML = '🗑️ Banish';
        btnDelete.addEventListener('click', () => openDeleteModal(msg));

        ownerActions.appendChild(btnEdit);
        ownerActions.appendChild(btnDelete);
        cardTop.appendChild(ownerActions);
      }

      // Card Body: XSS-safe text rendering
      const cardBody = document.createElement('div');
      cardBody.className = 'card-body';
      // Use textContent to ensure any HTML or script tags are treated purely as inert text
      cardBody.textContent = msg.content;

      card.appendChild(cardTop);
      card.appendChild(cardBody);

      messagesContainer.appendChild(card);
    });
  }

  // =========================================================================
  // MESSAGE COMPOSING (Owner Only)
  // =========================================================================

  async function handleComposeSubmit(e) {
    e.preventDefault();
    if (!isOwner) {
      showNotice('Only the Crypt Keeper has power to carve inscriptions.', 'error');
      return;
    }

    const content = messageInput.value.trim();
    if (!content) return;

    btnPublish.disabled = true;
    btnPublish.textContent = 'Inscribing...';

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          isOwner = false;
          updateOwnerUI();
          throw new Error('Session expired. Please log in again.');
        }
        throw new Error(data.error || 'Failed to publish inscription');
      }

      // Clear input
      messageInput.value = '';
      if (charCounter) charCounter.textContent = '0';

      // Prepend message or re-fetch
      messagesList.unshift(data.message);
      renderMessages(messagesList);

      showNotice('✨ Inscription successfully carved into stone!', 'success');
    } catch (err) {
      showNotice(`⚠️ ${err.message}`, 'error');
    } finally {
      btnPublish.disabled = false;
      btnPublish.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
        Publish Inscription
      `;
    }
  }

  function showNotice(text, type = 'success') {
    if (!composeNotice) return;
    composeNotice.textContent = text;
    composeNotice.className = `action-notice ${type}`;
    composeNotice.style.display = 'flex';

    setTimeout(() => {
      composeNotice.style.display = 'none';
    }, 4500);
  }

  // =========================================================================
  // MESSAGE EDITING (Owner Only)
  // =========================================================================

  function openEditModal(msg) {
    if (!isOwner) return;
    editMessageId.value = msg.id;
    editMessageInput.value = msg.content;
    if (editCharCounter) editCharCounter.textContent = msg.content.length;
    if (editAlert) editAlert.style.display = 'none';

    if (editModal) editModal.style.display = 'flex';
    setTimeout(() => editMessageInput.focus(), 100);
  }

  function closeEditModal() {
    if (editModal) editModal.style.display = 'none';
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!isOwner) return;

    const id = editMessageId.value;
    const content = editMessageInput.value.trim();

    if (!content) return;

    const saveBtn = document.getElementById('btnSubmitEdit');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          isOwner = false;
          updateOwnerUI();
          closeEditModal();
          throw new Error('Session expired. Please log in again.');
        }
        throw new Error(data.error || 'Failed to update message');
      }

      // Update in local state
      const idx = messagesList.findIndex(m => m.id === parseInt(id, 10));
      if (idx !== -1) {
        messagesList[idx] = data.message;
        renderMessages(messagesList);
      }

      closeEditModal();
      showNotice('✨ Inscription words altered successfully!', 'success');
    } catch (err) {
      if (editAlert) {
        editAlert.textContent = err.message;
        editAlert.style.display = 'block';
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    }
  }

  // =========================================================================
  // MESSAGE DELETION (Owner Only with Confirmation)
  // =========================================================================

  function openDeleteModal(msg) {
    if (!isOwner) return;
    deleteTargetId.value = msg.id;
    if (deletePreviewText) {
      deletePreviewText.textContent = `"${msg.content.slice(0, 150)}${msg.content.length > 150 ? '...' : ''}"`;
    }
    if (deleteModal) deleteModal.style.display = 'flex';
  }

  function closeDeleteModal() {
    if (deleteModal) deleteModal.style.display = 'none';
  }

  async function handleDeleteConfirm() {
    if (!isOwner) return;

    const id = deleteTargetId.value;
    if (!id) return;

    btnConfirmDelete.disabled = true;
    btnConfirmDelete.textContent = 'Banishing...';

    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          isOwner = false;
          updateOwnerUI();
          closeDeleteModal();
          throw new Error('Session expired.');
        }
        throw new Error(data.error || 'Failed to banish inscription');
      }

      // Remove from local list
      messagesList = messagesList.filter(m => m.id !== parseInt(id, 10));
      renderMessages(messagesList);

      closeDeleteModal();
      showNotice('⚰️ Inscription has been banished to the abyss.', 'success');
    } catch (err) {
      alert(`Could not banish message: ${err.message}`);
    } finally {
      btnConfirmDelete.disabled = false;
      btnConfirmDelete.textContent = 'Banish Forever';
    }
  }

  function closeAllModals() {
    closeLoginModal();
    closeEditModal();
    closeDeleteModal();
  }

})();
