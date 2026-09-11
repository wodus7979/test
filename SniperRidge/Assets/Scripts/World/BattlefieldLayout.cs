using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Distances are measured from the player's trench, not absolute map coordinates.</summary>
    public static class BattlefieldLayout
    {
        public static Vector2 PlayerXZ => new Vector2(0f, TerrainGenerator.PlayerSpawnZ);

        public static List<EnemySpawn> SniperSpawns()
        {
            float[] angles = { -32f, -25f, -18f, -11f, -4f, 4f, 11f, 18f, 25f, 32f };
            float[] ranges = { 95f, 64f, 86f, 48f, 104f, 74f, 46f, 95f, 62f, 88f };
            EnemyKind[] kinds = { EnemyKind.Cover, EnemyKind.Tree, EnemyKind.Cover, EnemyKind.Patrol,
                EnemyKind.Tree, EnemyKind.Cover, EnemyKind.Tree, EnemyKind.Patrol, EnemyKind.Cover, EnemyKind.Tree };
            var result = new List<EnemySpawn>();
            int gunner = 0;
            for (int i = 0; i < angles.Length; i++)
            {
                Vector2 point = AtRange(angles[i], ranges[i]);
                // Different sight angles prevent a nearby cover object from hiding the entire rear row.
                Vector2 other = point + new Vector2(2.2f, .8f);
                bool sniper = i == 0 || i == 2 || i == 4 || i == 9;
                result.Add(new EnemySpawn(point.x, point.y, kinds[i], other.x, other.y,
                    sniper ? EnemyRole.Sniper : EnemyRole.MachineGunner, sniper ? 0 : gunner++ % EnemyCombatRoles.GunnerColors));
            }
            return result;
        }

        public static Vector2 DefenseSpawn(System.Random random, int wave)
        {
            // Leave the two outer firing lanes clear for the concealed snipers.
            float angle = Mathf.Lerp(-24f, 24f, (float)random.NextDouble());
            float distance = Mathf.Lerp(55f, 85f, (float)random.NextDouble()) + Mathf.Min(wave, 4) * 2f;
            return AtRange(angle, distance);
        }

        public static bool IsDefenseSniper(int index) => index == 3 || index == 7;
        public static Vector2 DefenseSniperSpawn(int index) => AtRange(index == 3 ? -32f : 32f, 92f);

        public static EnemySpawn DefenseSoldier(System.Random random, int wave, int index)
        {
            if (IsDefenseSniper(index))
            {
                Vector2 point = DefenseSniperSpawn(index);
                return new EnemySpawn(point.x, point.y, EnemyKind.Cover, role: EnemyRole.Sniper);
            }
            Vector2 rush = DefenseSpawn(random, wave);
            int ordinal = index - (index > 3 ? 1 : 0) - (index > 7 ? 1 : 0);
            return new EnemySpawn(rush.x, rush.y, EnemyKind.Rusher, role: EnemyRole.MachineGunner,
                uniformVariant: (ordinal + wave - 1) % EnemyCombatRoles.GunnerColors);
        }

        static Vector2 AtRange(float degrees, float distance)
        {
            float angle = degrees * Mathf.Deg2Rad;
            return PlayerXZ + new Vector2(Mathf.Sin(angle), Mathf.Cos(angle)) * distance;
        }

        // Keep random decoration out of the engagement fan; authored enemy cover is placed separately.
        public static bool IsCombatLane(float x, float z)
        {
            float forward = z - TerrainGenerator.PlayerSpawnZ;
            return forward >= -3f && forward <= 120f && Mathf.Abs(x) < 9f + Mathf.Max(0f, forward) * .72f;
        }
    }
}
