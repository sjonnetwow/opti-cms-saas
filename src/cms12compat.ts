import { type OnPageEdit, type CmsPage } from "@remkoj/optimizely-cms-nextjs";
import { GraphQLClient } from "graphql-request";
import { type ContentQueryProps } from "@remkoj/optimizely-cms-react";
import { type ContentAreaItemDefinition } from "@remkoj/optimizely-cms-react/rsc";
import { getContentById as coreGetContentById, getContentByPath as coreGetContentByPath } from "@/gql/functions";
import { type getContentByIdQueryVariables, type getContentByPathQueryVariables } from "@/gql/graphql";
import type { 
    // PageIContentListItemFragment, 
    PageIContentListItemSearchFragment, 
    // IContentListItemFragment, 
    IContentListItemSearchFragment } from "@/gql/graphql";
import { isOptiGraphClient } from "@remkoj/optimizely-graph-client";

type PromisedType<PT extends Promise<any>> = PT extends Promise<infer DT> ? DT : any
type ContentItem = NonNullable<OnPageEdit.Types.GetContentByIdData['content']>['items'] extends Array<infer AT> ? AT : any
type ContentItemPath<LocaleType = string> = NonNullable<NonNullable<Required<PromisedType<ReturnType<CmsPage.GetContentByPathMethod<LocaleType>>>>['content']>['items']> extends Array<infer AT> ? NonNullable<AT> : any
type GetContentByPathVariables<LocaleType = string> = Parameters<CmsPage.GetContentByPathMethod<LocaleType>>[1]

/**
 * Wrapped version of the CMS12 getContentByPath function, which both transforms
 * the incoming variables as well as the returned data to be in line with the 
 * data format expected by the framework.
 * 
 * ***WARNING***: This method changes the returned format of Content Area's as
 * well to be compatible with the CmsContentArea component, yet it does **not**
 * change the type defintions based on the GraphQL queries, so you ***must***
 * resolve these typings yourself ór instruct TypeScript to ignore the error.
 *
 * @param       client          GraphQL Client
 * @param       variables       The request variables
 * @returns     The requested content
 */
export const getContentByPath: CmsPage.GetContentByPathMethod = async <LocaleType = string>(client: GraphQLClient, variables: GetContentByPathVariables<LocaleType>) =>
{
    const processedPath = Array.isArray(variables.path) ? variables.path.map(varPath => varPath.endsWith("/") ? varPath.substring(0, varPath.length - 1) : varPath) : (variables.path.endsWith("/") ? variables.path.substring(0, variables.path.length - 1) : variables.path)
    const contentItem = await coreGetContentByPath(client, {
        path: processedPath,
        locale: variables.locale as getContentByPathQueryVariables['locale'],
        siteId: variables.siteId
    })

    // Map the output
    const newItems = contentItem.content?.items?.map<ContentItemPath<LocaleType> | null>(item => updateResponseData(item)).filter(isNotNullOrUndefined)

    // Construct the new response
    const data : PromisedType<ReturnType<CmsPage.GetContentByPathMethod<LocaleType>>> = {
        content: {
            items: newItems ?? []
        }
    };

    if (isOptiGraphClient(client) && client.debug)
        console.log("🔺 [CMS 12 Compatibility] getContentByPath", variables.path, JSON.stringify(data.content?.items?.at(0)))

    return data
}

/**
 * Wrapped version of the CMS12 getContentById function, which both transforms
 * the incoming variables as well as the returned data to be in line with the 
 * data format expected by the framework.
 * 
 * ***WARNING***: This method changes the returned format of Content Area's as
 * well to be compatible with the CmsContentArea component, yet it does **not**
 * change the type defintions based on the GraphQL queries, so you ***must***
 * resolve these typings yourself ór instruct TypeScript to ignore the error.
 *
 * @param       client          GraphQL Client
 * @param       variables       The request variables
 * @returns     The requested content
 */
export const getContentById: OnPageEdit.Types.GetContentByIdMethod = async <LocaleType = string>(client: GraphQLClient, variables: ContentQueryProps<LocaleType>) => 
{
    // Map the content request to the old query format
    const workId = tryParseInt(variables.version)
    const contentItem = await coreGetContentById(client, {
        guidValue: variables.key,
        workId,
        locale: variables.locale as getContentByIdQueryVariables['locale'],
        isCommonDraft: typeof workId == 'number' && workId > 0 ? true : undefined
    })

    // Map the output
    const newItems = contentItem.content?.items?.map<ContentItem | null>(item => updateResponseData(item)).filter(isNotNullOrUndefined)

    // Construct the new response
    const data : OnPageEdit.Types.GetContentByIdData = {
        content: {
            total: contentItem.content?.total ?? 0,
            items: newItems ?? []
        }
    };

    if (isOptiGraphClient(client) && client.debug)
        console.log("🔺 [CMS 12 Compatibility] getContentById", variables.key, JSON.stringify(data.content?.items?.at(0)))

    return data
}

function updateResponseData(item: Record<string,any> | null, baseDomain?: string) : any
{
    if (!(typeof item == 'object' && item != null && item.contentType && Array.isArray(item.contentType)))
        return item

    const newMetaData = {
        displayName: "CMS 12: " + (item?._metadata?.key ?? "inline item"),
        version: item?._metadata?.version?.toString(),
        key: item?._metadata?.key ?? null,
        locale: item?.locale?.name ?? null,
        types: (item?.contentType?.filter(isNotNullOrUndefined) ?? []).reverse().map(x => x == "block" ? "component" : x == "Block" ? "Component" : x),
        url: {
            base: baseDomain,
            hierarchical: item?.path,
            default: item?.path
        }
    }
    const withUpdatedMeta : Record<string,any> = {
        ...item,
        _metadata: newMetaData,
        _type: item?._type ?? ""
    }

    if (withUpdatedMeta.path !== undefined)
        delete withUpdatedMeta.path
    if (withUpdatedMeta.locale !== undefined)
        delete withUpdatedMeta.locale
    if (withUpdatedMeta.contentType !== undefined)
        delete withUpdatedMeta.contentType

    return withUpdatedMeta
}

export type Cms12ContentAreaItem = {
    item?: {
        data?: {
            contentType?: (string | null)[] | null
        } | null
    } | null
    displayOption?: string | null
} | null | 
    // { ' $fragmentRefs'?: { IContentListItemFragment: IContentListItemFragment; } } |
    { ' $fragmentRefs'?: { IContentListItemSearchFragment: IContentListItemSearchFragment; } } |
    { ' $fragmentRefs'?: { PageIContentListItemSearchFragment: PageIContentListItemSearchFragment; } } 
    // | 
    // { ' $fragmentRefs'?: { PageIContentListItemFragment: PageIContentListItemFragment; } }

/**
 * Utility function to transform the items within a content area from the CMS12
 * to the CMS13 format, so they'll work correctly with the components in the
 * Next.JS SDK.
 * 
 * @param contentAreaItem 
 * @param baseDomain 
 * @returns 
 */
export function transformContentAreaItem(contentAreaItem: Cms12ContentAreaItem, baseDomain?: string) : ContentAreaItemDefinition | null
{
    if (!(typeof(contentAreaItem) == 'object' && contentAreaItem != null 
            && typeof((contentAreaItem as any).item) == 'object' && (contentAreaItem as any).item != null
            && typeof((contentAreaItem as any).item.data) == 'object' && (contentAreaItem as any).item.data != null
            && Array.isArray((contentAreaItem as any).item.data.contentType)))
        return null

    const newData = updateResponseData((contentAreaItem as any).item.data, baseDomain)
    return {
        ...newData,
        _metadata: {
            displayOption: (contentAreaItem as any).displayOption,
            ...newData._metadata
        }
    }
}

function tryParseInt(input: string | null | undefined): number | null {
    if (!input)
        return null
    try {
        return Number.parseInt(input, 10)
    } catch {
        return null
    }
}

function isNotNullOrUndefined<T>(toTest: T | null | undefined) : toTest is T
{
    if (toTest === null || toTest === undefined)
        return false
    return true
}