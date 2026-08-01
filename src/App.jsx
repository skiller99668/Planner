import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import MobileNav from './components/MobileNav.jsx'
import Dashboard from './components/Dashboard.jsx'
import TasksView from './components/TasksView.jsx'
import ModuleStub from './components/ModuleStub.jsx'
import { usePlannerData } from './lib/store.js'

export default function App() {
  const [active, setActive] = useState('dashboard')
  const planner = usePlannerData()

  const renderView = () => {
    switch (active) {
      case 'dashboard':
        return (
          <Dashboard
            plannerData={planner}
            onLogGym={planner.logGymSession}
            onLogBadminton={planner.logBadmintonSession}
            onToggleTask={planner.toggleTask}
          />
        )
      case 'tasks':
        return (
          <TasksView
            plannerData={planner}
            onAddTask={planner.addTask}
            onToggleTask={planner.toggleTask}
            onDeleteTask={planner.deleteTask}
          />
        )
      case 'academics':
        return (
          <ModuleStub
            title="Academics"
            description="Course list, assignment tracker, and a live GPA calculator against your 3.8 floor go here next."
            comingNext={['Course list', 'Assignment tracker', 'GPA calculator']}
          />
        )
      case 'fitness':
        return (
          <ModuleStub
            title="Fitness"
            description="Full PPL session history, streaks, and optional set/rep logging go here next. Quick-log from the Dashboard already saves data."
            comingNext={['Session history', 'Streak tracker', 'Set/rep log']}
          />
        )
      case 'badminton':
        return (
          <ModuleStub
            title="Badminton"
            description="Session log, tournament tracker with results and notes go here next. Quick-log from the Dashboard already saves data."
            comingNext={['Session history', 'Tournament tracker']}
          />
        )
      case 'career':
        return (
          <ModuleStub
            title="Career"
            description="Application pipeline (kanban), club/team tracker, project portfolio, and networking log go here next."
            comingNext={['Application pipeline', 'Projects', 'Networking log']}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink flex">
      <Sidebar active={active} onNavigate={setActive} />
      <main className="flex-1 px-4 sm:px-8 py-6 pb-24 md:pb-8 max-w-4xl mx-auto w-full">
        {renderView()}
      </main>
      <MobileNav active={active} onNavigate={setActive} />
    </div>
  )
}
