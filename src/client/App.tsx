// [spec: UI-001]
// [spec: UI-002]
// [spec: UI-003]
// [spec: UI-004]
// [spec: UI-006]
// [spec: UI-007]
// [spec: UI-009]
// [spec: UI-011]
// [spec: UI-013]
import { h } from "preact";
import { DEFAULT_DONE_RETENTION_DAYS } from "../shared/types.js";
import { useKajApp } from "./hooks/useKajApp.js";
import { TopBar } from "./components/TopBar.js";
import { SwimlaneBoard } from "./components/SwimlaneBoard.js";
import { CalendarView } from "./components/CalendarView.js";
import { DesktopCockpit } from "./components/DesktopCockpit.js";
import { MobileViews } from "./components/MobileViews.js";
import { TaskModal } from "./components/TaskModal.js";
import { CompletedDrawer } from "./components/CompletedDrawer.js";
import { ProjectReorderModal } from "./components/ProjectReorderModal.js";

export function App() {
  const {
    currentView,
    setCurrentView,
    mobileTab,
    setMobileTab,
    searchQuery,
    setSearchQuery,
    cardDensity,
    hideRepeatingTriage,
    projects,
    completedTasks,
    telemetry,
    vipUsers,
    memoryMb,
    errorMessage,
    setErrorMessage,
    isTaskModalOpen,
    setIsTaskModalOpen,
    selectedTask,
    defaultActionDate,
    defaultStatus,
    defaultProjectId,
    isArchiveOpen,
    setIsArchiveOpen,
    isReorderOpen,
    setIsReorderOpen,
    filteredTasks,
    hiddenRepeatingTriageCount,
    filteredSwimlanes,
    filteredCompletedTasks,
    filteredUnscheduledTasks,
    filteredCalendarEvents,
    closeTaskModal,
    handleCalendarRangeChange,
    handleOpenAddTask,
    handleCreateTaskOnDate,
    handleCreateTaskInColumn,
    handleSelectTask,
    handleSaveTask,
    handleDeleteTask,
    handleUpdateTaskStatus,
    handleMoveTask,
    handleCompleteTask,
    handleRestoreTask,
    handlePurgeCompleted,
    handleScheduleTask,
    handleReorderProjects,
    handleCreateProject,
    handleDensityChange,
    handleToggleHideRepeatingTriage,
    handleReorderTasks,
  } = useKajApp();

  return (
    <div className="min-h-screen flex flex-col bg-[#0E1111] text-[#F3F4F6]">
      {/* Top Floating Command Bar */}
      <TopBar
        currentView={currentView}
        onViewChange={setCurrentView}
        density={cardDensity}
        onDensityChange={handleDensityChange}
        onAddTask={handleOpenAddTask}
        onOpenArchive={() => setIsArchiveOpen(true)}
        onOpenReorder={() => setIsReorderOpen(true)}
        completedCount={completedTasks.length}
        memoryMb={memoryMb}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col w-full">
        {/* Mobile Layout (< md) */}
        <MobileViews
          currentTab={mobileTab}
          onTabChange={setMobileTab}
          swimlanes={filteredSwimlanes}
          tasks={filteredTasks}
          projects={projects}
          completedTasks={filteredCompletedTasks}
          unscheduledTasks={filteredUnscheduledTasks}
          calendarEvents={filteredCalendarEvents}
          density={cardDensity}
          hideRepeatingTriage={hideRepeatingTriage}
          hiddenRepeatingTriageCount={hiddenRepeatingTriageCount}
          onToggleHideRepeatingTriage={handleToggleHideRepeatingTriage}
          onSelectTask={handleSelectTask}
          onUpdateTaskStatus={handleUpdateTaskStatus}
          onMoveTask={handleMoveTask}
          onCompleteTask={handleCompleteTask}
          onRestoreTask={handleRestoreTask}
          onScheduleTask={handleScheduleTask}
          onReorderProjects={handleReorderProjects}
          onOpenReorderModal={() => setIsReorderOpen(true)}
          onCreateTaskOnDate={handleCreateTaskOnDate}
          onCreateTaskInColumn={handleCreateTaskInColumn}
        />

        {/* Desktop Layout (>= md) */}
        <div className="hidden md:flex flex-1 flex-col w-full">
          {currentView === "cockpit" ? (
            <DesktopCockpit
              tasks={filteredTasks}
              projects={projects}
              completedTasks={filteredCompletedTasks}
              telemetry={searchQuery.trim() ? null : telemetry}
              vipUsers={vipUsers}
              hideRepeatingTriage={hideRepeatingTriage}
              hiddenRepeatingTriageCount={hiddenRepeatingTriageCount}
              onToggleHideRepeatingTriage={handleToggleHideRepeatingTriage}
              onSelectTask={handleSelectTask}
              onCompleteTask={handleCompleteTask}
              onUpdateTaskStatus={handleUpdateTaskStatus}
              onAddTask={() => setIsTaskModalOpen(true)}
            />
          ) : currentView === "board" ? (
            <SwimlaneBoard
              swimlanes={filteredSwimlanes}
              density={cardDensity}
              hideRepeatingTriage={hideRepeatingTriage}
              hiddenRepeatingTriageCount={hiddenRepeatingTriageCount}
              onToggleHideRepeatingTriage={handleToggleHideRepeatingTriage}
              onSelectTask={handleSelectTask}
              onUpdateTaskStatus={handleUpdateTaskStatus}
              onMoveTask={handleMoveTask}
              onCompleteTask={handleCompleteTask}
              onReorderTasks={handleReorderTasks}
              onCreateTaskInColumn={handleCreateTaskInColumn}
            />
          ) : (
            <CalendarView
              tasks={filteredTasks}
              calendarEvents={filteredCalendarEvents}
              unscheduledTasks={filteredUnscheduledTasks}
              onSelectTask={handleSelectTask}
              onScheduleTask={handleScheduleTask}
              onRangeChange={handleCalendarRangeChange}
              onCreateTaskOnDate={handleCreateTaskOnDate}
            />
          )}
        </div>
      </main>

      {/* Task Modal (Light-dismiss dialog) */}
      <TaskModal
        isOpen={isTaskModalOpen}
        task={selectedTask}
        projects={projects}
        defaultActionDate={defaultActionDate}
        defaultStatus={defaultStatus}
        defaultProjectId={defaultProjectId}
        onClose={closeTaskModal}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        onComplete={handleCompleteTask}
      />

      {/* Completed Archive Drawer */}
      <CompletedDrawer
        isOpen={isArchiveOpen}
        tasks={completedTasks}
        projects={projects}
        retentionDays={telemetry?.retention_days ?? DEFAULT_DONE_RETENTION_DAYS}
        onClose={() => setIsArchiveOpen(false)}
        onRestoreTask={handleRestoreTask}
        onPurgeExpired={handlePurgeCompleted}
      />

      {/* Project Swimlane Reorder & Creation Modal */}
      <ProjectReorderModal
        isOpen={isReorderOpen}
        projects={projects}
        onClose={() => setIsReorderOpen(false)}
        onReorder={handleReorderProjects}
        onCreateProject={handleCreateProject}
      />

      {/* Non-blocking Accessible Error Notification Toast */}
      {errorMessage && (
        <div
          data-testid="error-toast"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#241315] border border-rose-700/80 text-rose-200 text-xs shadow-2xl backdrop-blur-md transition-all"
        >
          <span className="font-bold text-rose-400">Error:</span>
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-2 text-rose-400 hover:text-white font-bold p-1 rounded hover:bg-rose-900/50"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
