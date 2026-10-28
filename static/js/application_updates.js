/* Release Updates: one current action, verified download, explicit restart. */
(() => {
    const root = document.getElementById('applicationUpdateControls');
    if (!root) return;
    const get = id => document.getElementById(id);
    const cached = JSON.parse(get('applicationReleaseState').textContent);
    const message = get('applicationUpdateMessage');
    const check = get('applicationUpdateCheck');
    const download = get('applicationUpdateDownload');
    const install = get('applicationUpdateInstall');
    const confirmation = get('applicationUpdateConfirmation');
    const actions = get('applicationUpdateActions');
    const badge = get('applicationUpdateBadge');
    const busyStates = new Set(['checking', 'downloading', 'verifying', 'installing']);
    const platformNames = {'windows-x86_64': 'Windows · 64-bit', 'linux-x86_64': 'Linux · x86-64', 'macos-arm64': 'macOS · Apple Silicon'};
    let csrf = '', timer, lastState, pending = false, statusFailed = false;
    let restarting = false, restartStarted = 0, oldVersion = cached.current_version || '';

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(refresh, 1200);
    }

    function closeConfirmation() {
        confirmation.hidden = true;
        actions.hidden = false;
    }

    function updateReminder(latest, newer, mode) {
        const reminder = get('releaseUpdateReminder');
        reminder.hidden = !newer || !cached.check_enabled;
        get('releaseUpdateReminderTitle').textContent = mode === 'ready'
            ? `Deckadence ${latest} is ready to install` : `Deckadence ${latest} is available`;
        get('releaseUpdateReminderMessage').textContent = busyStates.has(mode)
            ? 'View update progress in Release Updates.' : 'See what’s new and update when you’re ready.';
        const count = Array.from(document.querySelectorAll('.settings-reminder-shortcut')).filter(row => !row.hidden).length;
        get('settingsReminderCount').textContent = count;
        get('settingsReminderCount').hidden = !count;
        get('settingsRemindersEmpty').hidden = !!count;
    }

    function render(state) {
        lastState = state;
        statusFailed = false;
        csrf = state.csrf || '';
        const mode = state.state;
        const busy = busyStates.has(mode);
        const latest = state.latest_version ?? cached.latest_version;
        const newer = state.newer_release ?? cached.update_available;
        const supported = !!state.supported;
        const downloadable = supported && state.available && !busy && mode !== 'ready';
        const installable = supported && mode === 'ready' && state.can_restart;
        root.dataset.state = mode || 'idle';
        get('applicationUpdateInstalled').textContent = state.current_version || cached.current_version || 'Unknown';
        get('applicationUpdateLatest').textContent = latest || 'Not checked';

        let label = newer ? 'Update available' : latest ? 'No newer release' : 'Not checked';
        let title = newer ? 'A new version is available.' : latest ? 'No newer release is available.' : 'Check for a new release.';
        let copy = state.message || cached.error || 'Check GitHub for an update for this computer.';
        let tone = newer ? 'info' : 'neutral';
        if (mode === 'idle' && !state.latest_version && cached.latest_version) {
            copy = newer ? 'Check for a compatible update, then download when you’re ready.' : 'Check again for the latest release information.';
        }
        if (mode === 'available') {
            copy = 'Download now. Restart when you’re ready to install.';
        } else if (mode === 'checking') {
            label = 'Checking'; title = 'Checking GitHub for updates…';
        } else if (mode === 'downloading') {
            label = 'Downloading'; title = 'Downloading your update…'; copy = 'You can keep using Deckadence while it downloads.';
        } else if (mode === 'verifying') {
            label = 'Verifying'; title = 'Verifying the download…';
        } else if (mode === 'ready') {
            label = 'Ready to install'; title = 'Your update is ready to install.'; tone = 'success';
            if (!state.can_restart) copy = 'Automatic restart is unavailable with this server. Start Deckadence using its packaged launcher to install updates.';
        } else if (mode === 'installing') {
            label = 'Installing'; title = 'Deckadence is restarting…';
        } else if (mode === 'complete') {
            label = 'Update installed'; title = 'Deckadence has been updated.'; tone = 'success';
        } else if (mode === 'failed') {
            label = 'Update interrupted'; title = 'The update couldn’t finish.'; tone = 'warning';
        }
        if (!supported) {
            label = state.host_required ? 'Host computer required' : 'Manual installation';
            title = state.host_required ? 'Install from the Deckadence computer.' : 'Automatic installation is unavailable.';
            copy = state.reason || copy;
            tone = 'neutral';
        }
        badge.textContent = label;
        badge.dataset.tone = tone;
        get('applicationUpdateTitle').textContent = title;
        message.textContent = copy;

        check.hidden = !supported;
        check.disabled = busy || pending;
        check.classList.toggle('secondary-button', downloadable || installable);
        check.querySelector('span').textContent = busy ? label + '…' : downloadable || installable ? 'Check again' : 'Check for updates';
        get('legacyReleaseCheck').hidden = supported;
        download.hidden = !downloadable;
        download.disabled = pending;
        download.querySelector('span').textContent = mode === 'failed' ? 'Try download again' : 'Download update';
        install.hidden = !installable;
        install.disabled = pending;
        if (!installable) closeConfirmation();

        get('applicationUpdateMeta').hidden = !state.platform;
        get('applicationUpdatePlatform').textContent = platformNames[state.platform] || state.platform || '';
        const size = get('applicationUpdateSize');
        size.hidden = !state.download_bytes;
        size.textContent = state.download_bytes ? Math.ceil(state.download_bytes / 1024 / 1024) + ' MB' : '';
        get('applicationUpdateDownloadProgress').hidden = !['downloading', 'verifying'].includes(mode);
        const progress = get('applicationUpdateProgress');
        const total = state.total_bytes || state.download_bytes;
        if (mode === 'downloading' && total) {
            const completed = Math.min(total, state.completed_bytes || 0);
            progress.max = total; progress.value = completed;
            get('applicationUpdateProgressText').textContent = `${Math.floor(completed / 1024 / 1024)} MB of ${Math.ceil(total / 1024 / 1024)} MB`;
            get('applicationUpdatePercent').textContent = Math.floor(completed / total * 100) + '%';
        } else {
            progress.removeAttribute('value');
            get('applicationUpdateProgressText').textContent = mode === 'verifying' ? 'Checking package integrity…' : 'Preparing download…';
            get('applicationUpdatePercent').textContent = '';
        }
        get('applicationUpdateHost').hidden = !state.host_required;
        get('applicationUpdateHostAddress').textContent = state.local_url || '';
        const notes = state.notes ?? cached.release_notes;
        const releaseUrl = state.release_url ?? cached.release_url;
        get('applicationUpdateNotes').hidden = !notes && !releaseUrl;
        get('applicationUpdateNotesText').textContent = notes || '';
        get('applicationUpdateReleaseLink').href = releaseUrl || 'https://github.com/Regenshire/Deckadence/releases';
        const checked = state.last_checked_utc || cached.last_checked_utc;
        const checkedDate = checked ? new Date(checked.replace(' UTC', 'Z').replace(' ', 'T')) : null;
        get('applicationUpdateLastChecked').textContent = checkedDate && !Number.isNaN(checkedDate.getTime())
            ? 'Checked ' + checkedDate.toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'}) : checked ? 'Checked ' + checked : 'Not checked yet';
        updateReminder(latest, newer, mode);

        if (mode === 'installing') {
            restarting = true;
            if (!restartStarted) restartStarted = Date.now();
        }
        if (restarting && !busy && (state.current_version !== oldVersion || ['failed', 'complete', 'ready'].includes(mode))) {
            restarting = false;
            if (state.current_version !== oldVersion) {
                window.location.reload();
                return;
            }
        }
        if (busy || restarting) schedule();
    }

    async function refresh() {
        clearTimeout(timer);
        try {
            const response = await fetch('/maintenance/updates/status', {cache: 'no-store', signal: AbortSignal.timeout(5000)});
            const state = await response.json();
            if (response.status === 403 && state.code === 'host_required') {
                render({supported: false, host_required: true, reason: state.message, local_url: state.local_url});
                return;
            }
            if (!response.ok) throw new Error(state.message || 'Could not read update status.');
            if (!oldVersion) oldVersion = state.current_version;
            render(state);
        } catch (error) {
            if (restarting && Date.now() - restartStarted < 240000) {
                message.textContent = 'Deckadence is restarting. Waiting to reconnect…';
                schedule();
            } else {
                statusFailed = true;
                closeConfirmation();
                message.textContent = restarting
                    ? 'Deckadence has not reconnected. Run the Start_Deckadence launcher in your application folder to recover, then reload this page.'
                    : 'Could not read update status. Check your connection and try again.';
                badge.textContent = 'Connection interrupted'; badge.dataset.tone = 'warning';
                download.hidden = install.hidden = true;
                check.hidden = false; check.disabled = false;
                check.classList.remove('secondary-button');
                check.querySelector('span').textContent = 'Retry connection';
                get('legacyReleaseCheck').hidden = true;
            }
        }
    }

    async function operate(operation) {
        if (pending) return;
        pending = true;
        clearTimeout(timer);
        closeConfirmation();
        check.disabled = download.disabled = install.disabled = true;
        get('applicationUpdateConfirmInstall').disabled = true;
        if (operation === 'install') { restarting = true; restartStarted = Date.now(); }
        try {
            const response = await fetch(`/maintenance/updates/${operation}`, {
                method: 'POST', headers: {'X-Deckadence-Update-CSRF': csrf}, signal: AbortSignal.timeout(10000)
            });
            const value = await response.json();
            if (!response.ok) {
                restarting = false;
                await refresh();
                message.textContent = value.message || 'The update operation could not start.';
                return;
            }
            await refresh();
        } catch (error) {
            if (restarting) {
                message.textContent = 'Waiting for Deckadence to reconnect…';
                schedule();
            } else {
                await refresh();
                message.textContent = 'The request could not be confirmed. Check the update status before trying again.';
            }
        } finally {
            pending = false;
            const busy = restarting || busyStates.has(lastState?.state);
            check.disabled = download.disabled = install.disabled = busy;
            get('applicationUpdateConfirmInstall').disabled = false;
        }
    }

    check.addEventListener('click', () => statusFailed ? refresh() : operate('check'));
    download.addEventListener('click', () => operate('download'));
    install.addEventListener('click', () => {
        confirmation.hidden = false; actions.hidden = true;
        get('applicationUpdateConfirmInstall').focus();
    });
    get('applicationUpdateCancelInstall').addEventListener('click', () => {closeConfirmation(); install.focus();});
    get('applicationUpdateConfirmInstall').addEventListener('click', () => operate('install'));
    refresh();
})();
