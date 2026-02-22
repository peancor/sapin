interface BreadcrumbItem {
    label: string;
    href?: string;
}

let currentItems: BreadcrumbItem[] = [];

export const breadcrumb = {
    set: (items: BreadcrumbItem[]) => {
        currentItems = items;
    },
    get: () => currentItems
};
