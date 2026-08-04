import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import type { Topic } from "../types/toefl";

interface TopicNavigatorProps {
  topics: Topic[];
  activeTopicId: number;
  collapsedCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  onSelectTopic: (topicId: number) => void;
  collapsed?: boolean;
  onTogglePanel?: () => void;
  embedded?: boolean;
}

export function TopicNavigator({
  topics,
  activeTopicId,
  collapsedCategories,
  onToggleCategory,
  onSelectTopic,
  collapsed = false,
  onTogglePanel,
  embedded = false,
}: TopicNavigatorProps): React.JSX.Element {
  const categories = Array.from(
    topics.reduce((map, topic) => {
      const list = map.get(topic.category) ?? [];
      list.push(topic);
      map.set(topic.category, list);
      return map;
    }, new Map<string, Topic[]>()),
  );

  return (
    <aside
      className={embedded ? "topic-navigator topic-navigator--embedded" : "topic-navigator"}
      aria-label="Practice topics"
      data-collapsed={!embedded && collapsed}
    >
      <div className="topic-navigator-heading">
        <div className="topic-navigator-heading-copy">
          <p>NEO tests 1–30</p>
          <span>120 interview questions</span>
        </div>
        {!embedded && onTogglePanel ? (
          <button
            type="button"
            className="topic-navigator-collapse"
            onClick={onTogglePanel}
            aria-label={collapsed ? "Expand topic sidebar" : "Collapse topic sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand topics" : "Collapse topics"}
          >
            <SidebarSimpleIcon size={19} weight="regular" aria-hidden />
          </button>
        ) : null}
      </div>

      <nav className="topic-list" aria-label="Topic library" aria-hidden={collapsed || undefined}>
        {categories.map(([category, categoryTopics]) => {
          const isCollapsed = collapsedCategories.has(category);
          const sectionId = `category-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

          return (
            <section className="topic-category" key={category}>
              <button
                type="button"
                className="category-trigger"
                onClick={() => onToggleCategory(category)}
                aria-expanded={!isCollapsed}
                aria-controls={sectionId}
              >
                <span>{category}</span>
                {isCollapsed ? (
                  <CaretRightIcon size={15} weight="bold" aria-hidden />
                ) : (
                  <CaretDownIcon size={15} weight="bold" aria-hidden />
                )}
              </button>

              <div id={sectionId} hidden={isCollapsed}>
                {categoryTopics.map((topic) => {
                  const isActive = topic.id === activeTopicId;
                  return (
                    <button
                      type="button"
                      key={topic.id}
                      className="topic-row"
                      data-active={isActive}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => onSelectTopic(topic.id)}
                      title={topic.title}
                    >
                      <span className="topic-number">{String(topic.id).padStart(2, "0")}</span>
                      <span className="topic-row-title">{topic.title}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </aside>
  );
}
