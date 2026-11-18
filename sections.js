// Section types Google Search can show on a results page, and how to spot them.
// Shared by the content script and the settings page.
//
// Found by surveying live English google.com searches (November 2026). Each
// section is recognised by its visible heading text (or, for ads, its
// accessibility label), never by Google's generated class names. Headings are
// English only, so on other interface languages most toggles have no effect.

globalThis.DP_GROUPS = [
  { id: 'ads', title: 'Ads and AI' },
  { id: 'questions', title: 'Questions and related searches' },
  { id: 'news', title: 'News and social' },
  { id: 'media', title: 'Images and video' },
  { id: 'shopping', title: 'Shopping, places and travel' },
  { id: 'answers', title: 'Quick answers' },
  { id: 'entities', title: 'Topic panels' },
];

// key:    storage key under settings.hide
// match:  heading texts (whole heading, case-insensitive) that start this section
// region: an aria-label of a role="region" element that is this section
// kp:     knowledge panel, detected structurally rather than by heading
// hide:   default (true = hidden on install)
// minor:  this heading also appears *inside* other sections (Google adds an
//         "Ask anything in AI Mode" box to each "People also ask" answer and to
//         AI Overviews). A minor heading never cuts another section's block
//         short, and is ignored when it sits inside another section.
globalThis.DP_SECTIONS = [
  { key: 'ads', group: 'ads', label: 'Sponsored results (ads)', hint: 'Ad blocks at the top and bottom of the page',
    region: ['Ads'], match: [/^sponsored( results?| products?)?$/], hide: true },
  // Google's "commercial search suggestions": searches picked to lead to
  // advertisers' offers. The links are new Google searches, not ads, and
  // carry no "Sponsored" label (Search Engine Roundtable, 2025).
  { key: 'relatedProducts', group: 'ads', label: 'Find related products & services', hint: 'Searches Google suggests to lead you to advertisers’ offers',
    match: [/^find related products (&|and) services$/], hide: true },
  { key: 'aiOverview', group: 'ads', label: 'AI Overview', hint: 'Including the “Thinking…” placeholder while it loads',
    match: [/^ai overview$/, /^thinking/], minor: true },
  { key: 'aiMode', group: 'ads', label: 'Ask anything in AI Mode', hint: 'The AI Mode prompt box',
    match: [/^ask anything in ai mode$/], minor: true },

  { key: 'peopleAlsoAsk', group: 'questions', label: 'People also ask',
    match: [/^people also ask$/] },
  { key: 'peopleAlsoSearch', group: 'questions', label: 'People also search for', hint: 'Related searches, usually near the bottom',
    match: [/^people also search for$/, /^related searches$/, /^searches related to\b/] },
  { key: 'thingsToKnow', group: 'questions', label: 'Things to know',
    match: [/^things to know$/] },

  { key: 'topStories', group: 'news', label: 'Top stories and news', hint: 'Including “Also in the news”',
    match: [/^top stories$/, /^also in the news$/, /^news$/] },
  { key: 'socialPosts', group: 'news', label: 'Social posts', hint: '“What people are saying” and “Latest posts from …”',
    match: [/^what people are saying$/, /^latest posts from\b/] },
  { key: 'discussions', group: 'news', label: 'Discussions and forums',
    match: [/^discussions and forums$/] },

  { key: 'images', group: 'media', label: 'Images',
    match: [/^images$/, /^images for\b/] },
  { key: 'videos', group: 'media', label: 'Videos and short videos',
    match: [/^videos$/, /^short videos$/] },

  { key: 'products', group: 'shopping', label: 'Popular products', hint: 'Unpaid shopping listings',
    match: [/^popular products$/, /^products$/] },
  { key: 'local', group: 'shopping', label: 'Places and maps', hint: 'Local results, store locations, top sights, hotels',
    match: [/^places$/, /^locations$/, /^local results$/, /^more locations$/, /^top sights in\b/, /^hotels \|/, /^more hotels$/] },
  { key: 'flights', group: 'shopping', label: 'Flights',
    match: [/^search flights$/, /^flight status$/, /^flights to\b/] },
  { key: 'events', group: 'shopping', label: 'Events',
    match: [/^events$/] },
  { key: 'jobs', group: 'shopping', label: 'Jobs',
    match: [/^jobs$/] },
  { key: 'recipes', group: 'shopping', label: 'Recipes',
    match: [/^recipes$/] },

  { key: 'weather', group: 'answers', label: 'Weather',
    match: [/^weather result$/] },
  { key: 'sports', group: 'answers', label: 'Sports scores',
    match: [/^sports results?$/] },
  { key: 'calculator', group: 'answers', label: 'Calculator',
    match: [/^calculator result$/] },
  { key: 'converters', group: 'answers', label: 'Unit and currency converters',
    match: [/^unit converter$/, /^currency converter$/] },
  { key: 'translate', group: 'answers', label: 'Translation',
    match: [/^translation result$/] },
  { key: 'featuredSnippet', group: 'answers', label: 'Featured snippet',
    match: [/^featured snippet from the web$/] },

  { key: 'knowledgePanel', group: 'entities', label: 'Knowledge panel', hint: 'The topic summary at the top or on the right',
    kp: true },
  { key: 'carousels', group: 'entities', label: 'Topic carousels', hint: 'Movies, TV shows, songs, albums, books, podcasts',
    match: [/^movies$/, /^tv shows$/, /^movies and shows$/, /^songs$/, /^albums$/, /^books$/, /^podcasts$/, /^episodes$/] },
  { key: 'scholarly', group: 'entities', label: 'Scholarly articles',
    match: [/^scholarly articles for\b/] },
];
