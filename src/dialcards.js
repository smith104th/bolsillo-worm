// The Dial's scales: left end | right end. Written for this app (Nov 16). The giver gets one at random
// (not one used in the last rounds) and can ask for another before giving the clue.
// {me} = the giver's name, {you} = the guesser's: filled in when the round is dealt and stored with it,
// so editing this list never changes a round already played.
export const SCALES = `
Cold|Hot
Ugly|Beautiful
Cheap|Expensive
Boring|Exciting
Useless|Useful
Quiet|Loud
Soft|Hard
Tiny|Huge
Sad|Happy
Safe|Dangerous
Normal|Weird
Old-fashioned|Trendy
Healthy|Unhealthy
Easy to do|Hard to do
Smells bad|Smells good
Underrated|Overrated
Forgettable|Iconic
Basic|Niche
Mild|Spicy
Calm|Chaotic
Casual|Formal
Bad idea|Good idea
Lazy|Ambitious
Rude|Polite
Clean|Dirty
Simple|Complicated
Silly|Sophisticated
Childish|Grown-up
Villain|Hero
Ordinary|Magical
Hilarious|Dead serious
Lukewarm take|Hot take
Classic|Modern
Low effort|High effort
Low stakes|High stakes
Tiny inconvenience|Total disaster
Mildly annoying|Infuriating
Totally optional|Absolutely necessary
Waste of time|Worth the time
Waste of money|Worth every peso
Rip-off|Bargain
Not worth the line|Worth the line
Good in theory|Good in practice
Better on paper|Better in real life
Bad advice|Good advice
Bad habit|Good habit
Bad hobby|Great hobby
Lame excuse|Great excuse
Bad movie|Great movie
Bad song|Great song
Bad gift|Great gift
Bad superpower|Great superpower
Bad tattoo|Great tattoo
Bad dance move|Great dance move
Bad pizza topping|Great pizza topping
Bad empanada filling|Great empanada filling
Bad name for a pet|Great name for a pet
Bad name for a band|Great name for a band
Bad name for a boat|Great name for a boat
Bad first date|Great first date
Awful text to get|Best text to get
Worst ice cream flavor|Best ice cream flavor
Worst way to wake up|Best way to wake up
Worst place to sleep|Best place to sleep
Worst chore|Best chore
Worst job|Dream job
Worst sound|Best sound
Worst emoji|Best emoji
Worst season|Best season
Worst Olympic sport|Best Olympic sport
Wasted Sunday|Perfect Sunday
Bad vacation|Dream vacation
Tourist trap|Hidden gem
Bad place to live|Great place to live
Overrated trip|Underrated trip
Feels far|Feels close
Concrete jungle|Wild nature
Beach trip|Mountain trip
Very New York|Very Buenos Aires
Very Colombian|Very Argentine
Feels 2000s|Feels 2020s
Feels like Monday|Feels like Friday
Feels like winter|Feels like summer
Sweater weather|T-shirt weather
Feels like a slap|Feels like a hug
Daytime thing|Nighttime thing
Indoor thing|Outdoor thing
Best at sunrise|Best at midnight
Breakfast food|Dinner food
Snack|Feast
Sweet|Savory
Gross|Delicious
Comfort food|Fancy food
Fast food|Fine dining
Needs salt|Too salty
Easy to cook|Hard to cook
Bad at 3am|Perfect at 3am
Goes badly with mate|Goes great with mate
Tastes like childhood|Acquired taste
Minimal|Maximal
Bad design|Good design
Ugly building|Beautiful building
Tacky|Classy
Kitsch|Art
Low-brow|High-brow
Ugly font|Beautiful font
Bad logo|Great logo
Ugly color|Beautiful color
Muted|Saturated
Looks old|Looks new
Cozy room|Cold room
Ugly word|Beautiful word
Hard to spell|Easy to spell
Hard to pronounce|Easy to pronounce
Sounds cheap|Sounds expensive
Sounds like a cat name|Sounds like a dog name
Sounds made up|Definitely true
Unpopular opinion|Popular opinion
Party pooper|Life of the party
Small talk|Deep talk
Easy to explain|Hard to explain
Easy to draw|Hard to draw
Easy to forgive|Hard to forgive
Easy to say sorry for|Hard to say sorry for
Peaceful|Stressful
Harmless|Evil
Totally fine|Morally wrong
Luck|Skill
More art|More science
Introvert thing|Extrovert thing
Pessimist|Optimist
Past|Future
Temporary|Forever
Famous for a minute|Famous forever
Unknown|Famous
Guilty pleasure|Proud of it
Fragile|Indestructible
Light|Heavy
Slow|Fast
Smooth|Rough
Round|Pointy
Wet|Dry
Short|Tall
Feels young|Feels old
Plain|Fancy
Cheap date|Expensive date
Adorable|Terrifying
Ugly animal|Cute animal
Harmless animal|Deadly animal
Normal pet|Weird pet
Bad for the planet|Good for the planet
Cringe|Cool
Petty|Mature
Small fight|Big fight
Bad sign|Good sign
Red flag|Green flag
The ick|Butterflies
Unromantic|Romantic
Bad date night|Perfect date night
Do it alone|Do it together
Makes distance harder|Makes distance easier
We'd forget it|We'll always remember it
Keep it private|Post it everywhere
{you} would hate it|{you} would love it
{me} would hate it|{me} would love it
Not {me} at all|So {me}
Not {you} at all|So {you}
{you} would never|{you} already has
{me} would never|{me} already has
`.trim().split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((p) => p.length === 2 && p[0] && p[1]);
