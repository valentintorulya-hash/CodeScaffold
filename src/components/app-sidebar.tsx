import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { LayoutDashboard, PieChart, GitCompare, TrendingUp, Settings } from "lucide-react"

// Menu items.
const items = [
  {
    title: "Прогнозы",
    id: "forecast",
    url: "#",
    icon: LayoutDashboard,
  },
  {
    title: "Анализ данных",
    id: "analysis",
    url: "#",
    icon: PieChart,
  },
  {
    title: "Сравнение моделей",
    id: "comparison",
    url: "#",
    icon: GitCompare,
  },
  {
    title: "Прогноз на будущее",
    id: "future",
    url: "#",
    icon: TrendingUp,
  },
  {
    title: "Настройки",
    id: "settings",
    url: "#",
    icon: Settings,
  },
]

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeView: string;
  onViewChange: (view: string) => void;
}

export function AppSidebar({ activeView, onViewChange, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="border-r border-slate-700/70 bg-slate-950" {...props}>
      <SidebarContent className="bg-slate-950">
        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-400">Меню</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={activeView === item.id}
                    onClick={() => onViewChange(item.id)}
                    tooltip={item.title}
                    className="
                      text-slate-300 
                      transition-all duration-200 ease-in-out
                      hover:bg-slate-800 hover:text-slate-50 hover:pl-3
                      active:bg-slate-800 active:text-amber-400
                      focus-visible:ring-1 focus-visible:ring-amber-500/50
                      data-[active=true]:bg-amber-500/10 data-[active=true]:text-amber-400 data-[active=true]:font-medium data-[active=true]:border-l-2 data-[active=true]:border-amber-500
                    "
                  >
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
