Shader "SniperRidge/EnemyUniform"
{
    Properties
    {
        _MainTex ("Original armor and fabric", 2D) = "white" {}
        _BumpMap ("Normal map", 2D) = "bump" {}
        _UniformColor ("Role uniform", Color) = (.83,.70,.48,1)
        _Glossiness ("Smoothness", Range(0,1)) = .25
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 200
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows addshadow
        #pragma target 3.0
        sampler2D _MainTex, _BumpMap;
        fixed4 _UniformColor;
        half _Glossiness;
        struct Input { float2 uv_MainTex; float2 uv_BumpMap; };
        void surf(Input IN, inout SurfaceOutputStandard o)
        {
            fixed3 original = tex2D(_MainTex, IN.uv_MainTex).rgb;
            half luminance = dot(original, half3(.2126,.7152,.0722));
            // The supplied Vanguard atlas uses tan armor, dark fabric/visor and red insignia.
            // Recolor the tan panels only; preserve the scratches, visor, straps and insignia.
            half armor = smoothstep(.06,.16,original.r-original.b)
                * smoothstep(.02,.07,original.g-original.b) * smoothstep(.15,.30,luminance);
            o.Albedo = lerp(original, _UniformColor.rgb * saturate(luminance*1.5), armor);
            o.Normal = UnpackNormal(tex2D(_BumpMap, IN.uv_BumpMap));
            o.Metallic = .05;
            o.Smoothness = _Glossiness;
            o.Occlusion = 1;
            o.Alpha = 1;
        }
        ENDCG
    }
    FallBack "Diffuse"
}
