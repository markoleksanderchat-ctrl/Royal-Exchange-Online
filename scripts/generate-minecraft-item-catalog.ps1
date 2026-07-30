param(
  [string]$MinecraftJar = 'C:\Users\marko\AppData\Roaming\.minecraft\versions\1.21.1\1.21.1.jar',
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\app\minecraft-items.ts')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-IssuerTicker([string]$id, [string]$kind) {
  $rules = @(
    @{ ticker = 'MUSC'; pattern = 'music_disc|jukebox|note_block|goat_horn' },
    @{ ticker = 'SCRV'; pattern = 'book|paper|(^|_)map$|filled_map|cartography|lectern|enchanting_table|compass|recovery_compass' },
    @{ ticker = 'APOT'; pattern = 'potion|brewing_stand|spider_eye|rabbit_foot|phantom_membrane|magma_cream|glistering_melon|blaze_powder|dragon_breath' },
    @{ ticker = 'ADVT'; pattern = 'netherite|ancient_debris|obsidian|crying_obsidian|glowstone|quartz|end_|ender|chorus|shulker|elytra|trial|mace|breeze|heavy_core|blaze|ghast|magma|wither|dragon|echo_shard|respawn_anchor|lodestone|soul_|warped|crimson|blackstone|basalt|froglight|spawn_egg' },
    @{ ticker = 'WIRE'; pattern = 'redstone|repeater|comparator|piston|observer|dispenser|dropper|crafter|sculk|sensor|daylight_detector|target|tripwire|lever|pressure_plate|button|lightning_rod|calibrated' },
    @{ ticker = 'SHIP'; pattern = 'boat|raft' },
    @{ ticker = 'FLET'; pattern = 'arrow|firework|feather|flint' },
    @{ ticker = 'BOWY'; pattern = 'bow|crossbow' },
    @{ ticker = 'CUTL'; pattern = '_(sword|axe|pickaxe|shovel|hoe)$|^shears$|brush' },
    @{ ticker = 'CORD'; pattern = '^leather_boots$' },
    @{ ticker = 'ARMR'; pattern = 'helmet|chestplate|leggings|boots|shield|smithing_template|wolf_armor' },
    @{ ticker = 'LORN'; pattern = 'saddle|horse_armor|^lead$|fishing_rod|carrot_on_a_stick|warped_fungus_on_a_stick' },
    @{ ticker = 'FOND'; pattern = 'hopper|rail|minecart|chain|bell|anvil|cauldron' },
    @{ ticker = 'GDSM'; pattern = 'gold|diamond|emerald|lapis|amethyst|clock' },
    @{ ticker = 'IRON'; pattern = 'iron|copper|raw_copper|raw_iron' },
    @{ ticker = 'COLL'; pattern = 'coal|charcoal|torch|furnace|campfire|lava_bucket' },
    @{ ticker = 'WAXC'; pattern = 'candle|honeycomb|beehive|bee_nest|waxed_' },
    @{ ticker = 'GLAZ'; pattern = 'glass|beacon|bottle|spyglass' },
    @{ ticker = 'STPL'; pattern = 'wool' },
    @{ ticker = 'DYER'; pattern = 'dye|carpet|banner|stained_|glazed_terracotta|concrete' },
    @{ ticker = 'MRCR'; pattern = 'loom|cloth' },
    @{ ticker = 'UPHL'; pattern = 'bed|painting|item_frame|armor_stand' },
    @{ ticker = 'HABD'; pattern = 'string|name_tag|pattern|bundle' },
    @{ ticker = 'SKIN'; pattern = 'leather|rabbit_hide' },
    @{ ticker = 'HORN'; pattern = 'bone|scute|shell|skull|head|armadillo' },
    @{ ticker = 'SALT'; pattern = 'prismarine|coral|sponge|kelp|sea_pickle|nautilus|heart_of_the_sea|conduit|seagrass' },
    @{ ticker = 'FISH'; pattern = 'cod|salmon|pufferfish|tropical_fish' },
    @{ ticker = 'POUL'; pattern = 'egg|chicken|rabbit' },
    @{ ticker = 'BUTR'; pattern = 'beef|porkchop|mutton|steak|stew' },
    @{ ticker = 'BAKR'; pattern = 'bread|cake|cookie|pie|baked_potato' },
    @{ ticker = 'FRUT'; pattern = 'apple|berr|melon|pumpkin|carrot|potato|beetroot|cocoa|sugar_cane' },
    @{ ticker = 'PEPR'; pattern = 'wheat|hay|sugar|dried_kelp' },
    @{ ticker = 'GARD'; pattern = 'sapling|leaves|flower|tulip|orchid|dandelion|allium|azure_bluet|daisy|cornflower|lily|rose|peony|sunflower|lilac|vine|moss|fungus|mushroom|roots|azalea|cactus|bamboo|seed|crop|fern|grass|bush|dripleaf|spore_blossom|pitcher|torchflower' },
    @{ ticker = 'COOP'; pattern = 'chest|barrel|bowl|bucket' },
    @{ ticker = 'JOIN'; pattern = '^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo)_(door|trapdoor|stairs|slab|fence|fence_gate|sign|hanging_sign)$' },
    @{ ticker = 'CARP'; pattern = 'log|wood|planks|stripped_' },
    @{ ticker = 'BRIK'; pattern = 'brick|terracotta|clay|mud|pot|sherd' },
    @{ ticker = 'MSON'; pattern = 'stone|cobble|deepslate|tuff|granite|diorite|andesite|sandstone|calcite|dripstone|gravel|sand' }
  )

  foreach ($rule in $rules) {
    if ($id -match $rule.pattern) { return $rule.ticker }
  }
  if ($kind -eq 'block') { return 'MSON' }
  return 'ADVT'
}

$excluded = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
@('air', 'cave_air', 'void_air', 'water', 'lava', 'fire', 'soul_fire', 'nether_portal', 'end_portal', 'end_gateway', 'moving_piston', 'piston_head') | ForEach-Object { [void]$excluded.Add($_) }

$zip = [System.IO.Compression.ZipFile]::OpenRead($MinecraftJar)
try {
  $langEntry = $zip.GetEntry('assets/minecraft/lang/en_us.json')
  $reader = [System.IO.StreamReader]::new($langEntry.Open())
  try { $lang = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }

  $models = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($entry in $zip.Entries) {
    if ($entry.FullName -match '^assets/minecraft/models/item/([^/]+)\.json$') { [void]$models.Add($Matches[1]) }
  }

  $items = @()
  foreach ($property in $lang.PSObject.Properties) {
    if ($property.Name -notmatch '^(item|block)\.minecraft\.(.+)$') { continue }
    $kind = $Matches[1]
    $id = $Matches[2]
    if (!$models.Contains($id) -or $excluded.Contains($id)) { continue }
    $items += [pscustomobject]@{ id = $id; name = [string]$property.Value; ticker = Get-IssuerTicker $id $kind }
  }
  $items = @($items | Sort-Object id -Unique)
} finally {
  $zip.Dispose()
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('export type MinecraftItemEntry = { id: string; name: string; ticker: string };')
$lines.Add('')
$lines.Add('export const MINECRAFT_VERSION = "1.21.1";')
$lines.Add("export const MINECRAFT_ITEM_COUNT = $($items.Count);")
$lines.Add('')
$lines.Add('// Generated from the installed vanilla 1.21.1 client item models and English language table.')
$lines.Add('export const MINECRAFT_ITEMS: MinecraftItemEntry[] = [')
foreach ($item in $items) {
  $idJson = ConvertTo-Json ([string]$item.id) -Compress
  $nameJson = ConvertTo-Json ([string]$item.name) -Compress
  $tickerJson = ConvertTo-Json ([string]$item.ticker) -Compress
  $lines.Add("  { id: $idJson, name: $nameJson, ticker: $tickerJson },")
}
$lines.Add('];')
$lines.Add('')

$absoluteOutput = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.File]::WriteAllLines($absoluteOutput, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Output "Generated $($items.Count) item entries at $absoluteOutput"
