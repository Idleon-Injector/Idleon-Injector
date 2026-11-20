import van from "../../../vendor/van-1.6.0.js";
import { joinClasses, toNodes } from "./accountShared.js";

const { div, span } = van.tags;

const sectionStates = new Map();

/**
 * The section a page with `sections` shows (sectionMode "switch") or has in view (headings on one long page), shared
 * by the page and the sidebar's list, which marks it and sets it when the player picks a section there.
 */
export const pageSection = (pageId, firstId) => {
    if (!sectionStates.has(pageId)) sectionStates.set(pageId, van.state(firstId));
    return sectionStates.get(pageId);
};

/** A page title followed by the section on screen, a step quieter: "Death Note  World 2". */
export const sectionTitle = (title, sections, active) =>
    span(
        title,
        span(
            { class: "account-tab-header__section" },
            () => sections.find((section) => section.id === active.val)?.label
        )
    );

export const renderLazyPanes = ({
    tabs,
    activeId,
    paneClass,
    activeClass = "active",
    dataAttr = "data-tab",
    renderContent,
}) =>
    tabs.map((tab) => {
        const pane = div({
            class: () => joinClasses(paneClass, activeId.val === tab.id && activeClass),
            [dataAttr]: tab.id,
        });

        let mounted = false;
        van.derive(() => {
            if (activeId.val !== tab.id || mounted) return;
            mounted = true;
            const content = renderContent(tab);
            if (content) van.add(pane, content);
        });

        return pane;
    });

/**
 * Render all pane bodies immediately and keep them mounted.
 * `renderContent` is called eagerly for every tab when the parent mounts.
 */
export const renderPersistentPagePanes = ({
    tabs,
    activeId,
    paneClass = "account-page-pane",
    hiddenClass = "account-page-pane--hidden",
    dataAttr = "data-tab",
    renderContent = null,
}) =>
    tabs.map((tab, index) =>
        div(
            {
                class: () => joinClasses(paneClass, activeId.val !== tab.id && hiddenClass),
                [dataAttr]: tab.id,
            },
            ...toNodes(typeof renderContent === "function" ? renderContent(tab, index) : null)
        )
    );
