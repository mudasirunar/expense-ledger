import React, { useState, useEffect } from 'react';
import { Project, ProjectStatus } from '@/domain/entities';
import { FirestoreProjectRepository } from '@/data/repositories/firestore';
import { useAuth } from '@/app/providers/AuthProvider';
import { Money } from '@/domain/accounting/money';
import { Glass, Button, Input } from 'glisse';
import { 
  Building2, 
  Plus, 
  Calendar, 
  MapPin, 
  X, 
  TrendingUp, 
  AlertCircle
} from 'lucide-react';

const projectRepo = new FirestoreProjectRepository();

export const ProjectsView: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.uid || 'guest-user';

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Form state
  const [name, setName] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [budgetStr, setBudgetStr] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [clientName, setClientName] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await projectRepo.list(userId);
      setProjects(data);
    } catch (err) {
      console.warn('[Projects] Load fallback:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [userId]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Project title is required.');
      return;
    }

    const budgetParsed = parseFloat(budgetStr) || 0;
    if (budgetParsed < 0) {
      setFormError('Budget cannot be negative.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const newProject: Project = {
        id: `prj-${Date.now()}`,
        name: name.trim(),
        code: code.trim() || undefined,
        budgetMinor: Math.round(budgetParsed * 100),
        startDate: startDate || new Date().toISOString().slice(0, 10),
        clientName: clientName.trim() || undefined,
        location: location.trim() || undefined,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await projectRepo.create(userId, newProject);
      setProjects((prev) => [newProject, ...prev]);
      setIsCreateOpen(false);
      resetForm();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setName('');
    setCode('');
    setBudgetStr('');
    setClientName('');
    setLocation('');
    setStartDate(new Date().toISOString().slice(0, 10));
    setFormError(null);
  };

  const getStatusBadge = (status: ProjectStatus) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'completed':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'on_hold':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      default:
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header action bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-[var(--lg-muted)] uppercase tracking-wider">
            Portfolio ({projects.length})
          </h2>
          <p className="text-[11px] text-[var(--lg-muted)]">
            Independent cost centers & construction ledgers
          </p>
        </div>

        <Button
          variant="filled"
          tint="#2563EB"
          icon={<Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
          onClick={() => setIsCreateOpen(true)}
          className="!text-xs font-semibold !py-1.5 !px-3.5"
        >
          New Project
        </Button>
      </div>

      {/* Projects List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Glass key={i} className="p-5 rounded-2xl animate-pulse space-y-3">
              <div className="h-4 bg-[var(--lg-muted)]/20 rounded w-1/3"></div>
              <div className="h-3 bg-[var(--lg-muted)]/20 rounded w-1/2"></div>
            </Glass>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Glass className="p-8 text-center space-y-3 rounded-2xl">
          <Building2 className="w-12 h-12 text-[var(--lg-muted)] mx-auto opacity-60" />
          <div>
            <p className="text-sm font-bold text-[var(--lg-foreground)]">No projects registered yet</p>
            <p className="text-xs text-[var(--lg-muted)] max-w-xs mx-auto mt-1 leading-relaxed">
              Create a dedicated project to track materials, labor wages, and contractor obligations with zero co-mingling.
            </p>
          </div>
          <div className="pt-2">
            <Button
              variant="filled"
              tint="#2563EB"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsCreateOpen(true)}
              className="!text-xs font-semibold"
            >
              Add First Project
            </Button>
          </div>
        </Glass>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Glass 
              key={project.id}
              onClick={() => setSelectedProject(project)}
              className="p-4 sm:p-5 rounded-2xl space-y-3 cursor-pointer hover:bg-[var(--lg-glass-active)] transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-[var(--lg-foreground)] text-sm sm:text-base truncate">
                      {project.name}
                    </span>
                    {project.code && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--lg-muted)]/10 text-[var(--lg-muted)]">
                        {project.code}
                      </span>
                    )}
                  </div>
                  {(project.location || project.clientName) && (
                    <div className="flex items-center gap-3 text-[11px] text-[var(--lg-muted)] mt-1">
                      {project.location && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          {project.location}
                        </span>
                      )}
                      {project.clientName && (
                        <span className="truncate">
                          Client: {project.clientName}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getStatusBadge(project.status)}`}>
                  {project.status.replace('_', ' ')}
                </span>
              </div>

              {/* Budget Overview Card */}
              <div className="pt-2 border-t border-[var(--lg-separator)] grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider block font-medium">
                    Allocated Budget
                  </span>
                  <span className="font-extrabold text-[var(--lg-foreground)] tabular-nums text-sm mt-0.5 block">
                    {Money.format(project.budgetMinor)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider block font-medium">
                    Start Date
                  </span>
                  <span className="font-medium text-[var(--lg-foreground)] flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3 text-[var(--lg-muted)]" />
                    {project.startDate}
                  </span>
                </div>
              </div>
            </Glass>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <Glass className="w-full max-w-md p-6 rounded-3xl space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--lg-separator)]">
              <div>
                <h3 className="text-base font-extrabold text-[var(--lg-foreground)]">Create New Project</h3>
                <p className="text-[11px] text-[var(--lg-muted)]">Set up an independent cost accounting center</p>
              </div>
              <button 
                onClick={() => {
                  setIsCreateOpen(false);
                  resetForm();
                }}
                className="p-1 rounded-full text-[var(--lg-muted)] hover:text-[var(--lg-foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                  Project Title *
                </label>
                <Input
                  placeholder="e.g. Plot 42 Gulberg Villa"
                  value={name}
                  onValueChange={setName}
                  className="!max-w-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                    Project Code
                  </label>
                  <Input
                    placeholder="e.g. GUL-42"
                    value={code}
                    onValueChange={setCode}
                    className="!max-w-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                    Budget (PKR)
                  </label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={budgetStr}
                    onValueChange={setBudgetStr}
                    className="!max-w-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                    Start Date
                  </label>
                  <Input
                    type="date"
                    value={startDate}
                    onValueChange={setStartDate}
                    className="!max-w-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                    Location / City
                  </label>
                  <Input
                    placeholder="e.g. Lahore"
                    value={location}
                    onValueChange={setLocation}
                    className="!max-w-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                  Client / Owner
                </label>
                <Input
                  placeholder="e.g. Haris Ali"
                  value={clientName}
                  onValueChange={setClientName}
                  className="!max-w-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--lg-separator)]">
                <Button
                  variant="glass"
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    resetForm();
                  }}
                  className="!text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  variant="filled"
                  tint="#2563EB"
                  type="submit"
                  disabled={submitting}
                  className="!text-xs font-semibold"
                >
                  {submitting ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </Glass>
        </div>
      )}

      {/* Project Detail Modal */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <Glass className="w-full max-w-md p-6 rounded-3xl space-y-5 shadow-2xl">
            <div className="flex items-start justify-between pb-3 border-b border-[var(--lg-separator)]">
              <div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getStatusBadge(selectedProject.status)}`}>
                  {selectedProject.status.replace('_', ' ')}
                </span>
                <h3 className="text-lg font-black text-[var(--lg-foreground)] mt-1.5">
                  {selectedProject.name}
                </h3>
                {selectedProject.code && (
                  <span className="text-xs font-mono text-[var(--lg-muted)]">
                    Code: {selectedProject.code}
                  </span>
                )}
              </div>
              <button 
                onClick={() => setSelectedProject(null)}
                className="p-1 rounded-full text-[var(--lg-muted)] hover:text-[var(--lg-foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-[var(--lg-muted)]/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider font-semibold block">
                    Total Budget
                  </span>
                  <span className="text-base font-extrabold text-[var(--lg-foreground)] tabular-nums">
                    {Money.format(selectedProject.budgetMinor)}
                  </span>
                </div>
                <TrendingUp className="w-6 h-6 text-blue-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-[var(--lg-muted)]/5">
                  <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider font-semibold block">
                    Start Date
                  </span>
                  <span className="font-semibold text-[var(--lg-foreground)] mt-0.5 block">
                    {selectedProject.startDate}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--lg-muted)]/5">
                  <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider font-semibold block">
                    Location
                  </span>
                  <span className="font-semibold text-[var(--lg-foreground)] mt-0.5 block truncate">
                    {selectedProject.location || 'Not specified'}
                  </span>
                </div>
              </div>

              {selectedProject.clientName && (
                <div className="p-3 rounded-xl bg-[var(--lg-muted)]/5">
                  <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider font-semibold block">
                    Client Name
                  </span>
                  <span className="font-semibold text-[var(--lg-foreground)] mt-0.5 block">
                    {selectedProject.clientName}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--lg-separator)]">
              <Button
                variant="glass"
                onClick={() => setSelectedProject(null)}
                className="!text-xs font-semibold"
              >
                Close
              </Button>
            </div>
          </Glass>
        </div>
      )}
    </div>
  );
};
