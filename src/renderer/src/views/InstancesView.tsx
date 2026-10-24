import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { InstanceSummary } from '@shared/types'
import { formatDuration, translate } from '../i18n'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { activeTask, selectedInstance, useStore } from '../state/store'
import { AccountMenu } from '../components/AccountMenu'
import { BannerView } from '../components/Banner'
import { Button } from '../components/Button'
import { CreateInstanceDialog } from '../components/CreateInstanceDialog'
import { LogPanel } from '../components/LogPanel'
import { TaskProgress } from '../components/TaskProgress'

export function InstancesView({ onManageAccounts }: { onManageAccounts: () => void }): JSX.Element {
  const { language, t } = useI18n()
  const instances = useStore((state) => state.instances)
  const selectedId = useStore((state) => state.selectedId)
  const filter = useStore((state) => state.filter)
  const select = useStore((state) => state.select)
  const setFilter = useStore((state) => state.setFilter)
  const instance = useStore(selectedInstance)
  const task = useStore(activeTask)
  const launch = useStore((state) => state.launch)
  const logs = useStore((state) => state.logs)
  const verify = useStore((state) => state.verify)
  const verifying = useStore((state) => state.verifying)
  const banner = useStore((state) => state.banner)
  const dismissBanner = useStore((state) => state.dismissBanner)
  const accounts = useStore((state) => state.accounts)

  const [createOpen, setCreateOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return instances
    return instances.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.mcVersion.toLowerCase().includes(query) ||
        item.loader.includes(query)
    )
  }, [instances, filter])

  const hasAccount = Boolean(accounts?.selectedId)
  const running = launch.phase === 'running' && launch.instanceId === instance?.id
  const launching = (launch.phase === 'preparing' || launch.phase === 'starting') && launch.instanceId === instance?.id

  useLaunchShortcut(instance, task, launching, running)

  return (
    <>
      <aside className="sidebar" aria-label={t('instances.title')}>
        <div className="sidebar__head">
          <span className="sidebar__title">{t('instances.title')}</span>
          <Button variant="ghost" onClick={() => setCreateOpen(true)}>
            {t('instances.new')}
          </Button>
        </div>
        {instances.length > 0 ? (
          <div className="sidebar__search">
            <input
              className="input"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('instances.filter')}
              aria-label={t('instances.filter')}
              type="search"
            />
          </div>
        ) : null}
        <div className="instances" role="list">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              role="listitem"
              className="instance"
              aria-current={item.id === selectedId}
              onClick={() => select(item.id)}
            >
              <span className="instance__name">{item.name}</span>
              <span className="instance__meta">
                {item.mcVersion} · {translate(language, `loader.${item.loader}` as MessageKey)}
                {item.installed ? '' : ` · ${t('status.notInstalled')}`}
              </span>
            </button>
          ))}
          {instances.length > 0 && filtered.length === 0 ? (
            <p className="log__empty">{t('instances.empty.filtered')}</p>
          ) : null}
        </div>
      </aside>

      <section className="main">
        {instance ? (
          <>
            <header className="main__head">
              <div className="main__identity">
                <h1 className="main__title">{instance.name}</h1>
                <span className="main__meta">
                  {instance.mcVersion} · {translate(language, `loader.${instance.loader}` as MessageKey)}
                  {instance.loaderVersion ? ` ${instance.loaderVersion}` : ''}
                  {instance.installed ? '' : ` · ${t('status.notInstalled')}`}
                </span>
              </div>
              <div className="main__actions">
                <AccountMenu onManage={onManageAccounts} />
                <PrimaryAction
                  instance={instance}
                  hasAccount={hasAccount}
                  running={running}
                  launching={launching}
                  taskId={task?.id ?? null}
                />
              </div>
            </header>

            <div className="main__body">
              {banner ? <BannerView banner={banner} onDismiss={dismissBanner} /> : null}

              {task ? <TaskProgress task={task} onCancel={() => void useStore.getState().cancelTask(task.id)} /> : null}

              {launch.instanceId === instance.id && launch.phase === 'crashed' ? (
                <div className="banner banner--error" role="alert">
                  <div className="banner__body">
                    <span className="banner__title">{t('status.crashed')}</span>
                    <span className="banner__detail">
                      {launch.error ? launch.error.message : `exit ${launch.exitCode ?? '?'}`}
                    </span>
                  </div>
                  <div className="banner__actions">
                    <Button variant="ghost" onClick={() => void useStore.getState().openLogs(instance.id)}>
                      {t('action.openLogs')}
                    </Button>
                  </div>
                </div>
              ) : null}

              {running ? (
                <p className="main__meta">
                  <Elapsed startedAt={launch.startedAt ?? null} />
                </p>
              ) : null}

              {verify && verify.instanceId === instance.id ? (
                <div className="panel">
                  <div className="panel__head">
                    <span className="panel__title">{t('action.verify')}</span>
                  </div>
                  <div className="panel__body">
                    {verify.report.issues.length === 0 ? (
                      <span className="field__hint">{t('verify.ok')}</span>
                    ) : (
                      <div className="banner__body">
                        <span className="banner__title">
                          {t('verify.issues', {
                            count: verify.report.issues.length,
                            files: verify.report.issues.map((issue) => issue.file).slice(0, 3).join(', ')
                          })}
                        </span>
                        <span className="banner__detail">{t('verify.repairHint')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 8 }}>
                {instance.installed ? (
                  <Button variant="ghost" onClick={() => void useStore.getState().verifyInstance(instance.id)} disabled={verifying}>
                    {verifying ? t('verify.running') : t('action.verify')}
                  </Button>
                ) : null}
              </div>

              <LogPanel
                lines={logs}
                open={logOpen}
                onToggle={() => setLogOpen((open) => !open)}
                onOpenFolder={() => void useStore.getState().openLogs(instance.id)}
              />
            </div>
          </>
        ) : (
          <div className="empty">
            <h1 className="empty__title">
              {instances.length === 0 ? t('instances.empty.title') : t('main.noSelection.title')}
            </h1>
            <p className="empty__hint">
              {instances.length === 0 ? t('instances.empty.hint') : t('main.noSelection.hint')}
            </p>
            {instances.length === 0 ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                {t('instances.empty.action')}
              </Button>
            ) : null}
            {banner ? <BannerView banner={banner} onDismiss={dismissBanner} /> : null}
          </div>
        )}
      </section>

      <CreateInstanceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}

interface PrimaryActionProps {
  instance: InstanceSummary
  hasAccount: boolean
  running: boolean
  launching: boolean
  taskId: string | null
}

function PrimaryAction({ instance, hasAccount, running, launching, taskId }: PrimaryActionProps): JSX.Element {
  const { t } = useI18n()
  const store = useStore.getState()

  if (running) {
    return (
      <Button variant="danger" onClick={() => void store.stop()}>
        {t('action.stop')}
      </Button>
    )
  }

  if (launching) {
    return (
      <Button variant="primary" disabled>
        {t('status.starting')}
      </Button>
    )
  }

  if (taskId) {
    return (
      <Button variant="primary" disabled>
        {t('status.installing')}
      </Button>
    )
  }

  if (!instance.installed) {
    if (!hasAccount) {
      return (
        <Button variant="primary" onClick={() => void store.install(instance.id)} title={t('error.launch.no-account')}>
          {t('action.install')}
        </Button>
      )
    }
    return (
      <Button variant="primary" onClick={() => void store.installAndPlay(instance.id)}>
        {t('action.installAndPlay')}
      </Button>
    )
  }

  return (
    <Button
      variant="primary"
      disabled={!hasAccount}
      title={hasAccount ? t('action.launchShortcut') : t('error.launch.no-account')}
      onClick={() => void store.play(instance.id)}
    >
      {t('action.play')}
    </Button>
  )
}

function Elapsed({ startedAt }: { startedAt: number | null }): JSX.Element {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const ms = startedAt ? now - startedAt : 0
  return <>{t('status.elapsed', { time: formatDuration(ms) })}</>
}

/** Ctrl/Cmd+Enter plays the selected, installed instance. */
function useLaunchShortcut(
  instance: InstanceSummary | null,
  task: { id: string } | null,
  launching: boolean,
  running: boolean
): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return
      if (!instance || !instance.installed || launching || running || task) return
      if (document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      void useStore.getState().play(instance.id)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [instance, task, launching, running])
}
