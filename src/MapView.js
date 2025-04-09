import React, { useRef, useEffect, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// 直接引入带所有信息的 geojson 数据
import redliningData from "./data/redlining_with_income.json";

// 你的 Mapbox token
mapboxgl.accessToken = "pk.eyJ1IjoiemhlbmdmYW4wMDAwIiwiYSI6ImNtOTY1YWkxMTB0b3QyaW9xeDB2dzdtcjAifQ.Efsxuzjn9FGnLZOoMVUUIA";

function MapView() {
  const mapContainer = useRef(null);
  const map = useRef(null);

  // 用来控制筛选条件（grade）
  const [gradeFilter, setGradeFilter] = useState("all");

  // 用来保存当前点击选中的 feature
  const [selectedFeature, setSelectedFeature] = useState(null);

  // 用来控制侧边栏展开/折叠
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 不同分级对应的填充颜色
  const gradeColors = {
    A: "#1a9850",
    B: "#91cf60",
    C: "#d9ef8b",
    D: "#fee08b"
  };



  // 根据当前的 gradeFilter 从 geojson 数据里过滤出 boston 城市的 feature
  const getFilteredFeatures = () => {
    return redliningData.features
      .filter((f) => f.properties.city?.toLowerCase() === "boston")
      .filter(
        (f) => gradeFilter === "all" || f.properties.grade === gradeFilter
      )
      .map((f, i) => {
        // 给每个 feature 一个独一无二的 id，后面鼠标悬停用
        f.id = i;
        return f;
      });
  };

  useEffect(() => {
    // 如果地图已初始化或者容器还没准备好，则不再重复初始化
    if (map.current || !mapContainer.current) return;

    // 初始化 map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v10",
      center: [-71.0589, 42.3601], // 波士顿坐标
      zoom: 11
    });

    map.current.on("load", () => {
      // 初次加载时获取过滤后的要素
      const geojson = {
        type: "FeatureCollection",
        features: getFilteredFeatures()
      };

      // 添加一个 source
      map.current.addSource("boston-zones", {
        type: "geojson",
        data: geojson
      });

      // 填充层：不同分级不同颜色
      map.current.addLayer({
        id: "boston-fill",
        type: "fill",
        source: "boston-zones",
        paint: {
          "fill-color": [
            "match",
            ["get", "grade"],
            "A", gradeColors.A,
            "B", gradeColors.B,
            "C", gradeColors.C,
            "D", gradeColors.D,
            /* other */ "#cccccc"
          ],
          "fill-opacity": 0.4
        }
      });

      // 给鼠标 hover 的那块 polygon 画一条比较粗的线
      map.current.addLayer({
        id: "boston-hover",
        type: "line",
        source: "boston-zones",
        layout: {},
        paint: {
          "line-color": "#000",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            2,
            0
          ]
        }
      });

      // 普通 outline，保证每个 polygon 有一个很细的边框
      map.current.addLayer({
        id: "boston-outline",
        type: "line",
        source: "boston-zones",
        paint: {
          "line-color": "#444",
          "line-width": 0.1
        }
      });

      // 用于记录当前鼠标悬停的 polygon id
      let hoveredPolygonId = null;

      // 初始化一个 Popup
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "custom-popup"
      });

      // 鼠标移动到 polygon 上时
      map.current.on("mousemove", "boston-fill", (e) => {
        map.current.getCanvas().style.cursor = "pointer";

        if (e.features.length > 0) {
          const feature = e.features[0];

          // 先把之前悬停的 polygon 还原
          if (hoveredPolygonId !== null) {
            map.current.setFeatureState(
              { source: "boston-zones", id: hoveredPolygonId },
              { hover: false }
            );
          }

          // 设置当前悬停的 polygon
          hoveredPolygonId = feature.id;
          map.current.setFeatureState(
            { source: "boston-zones", id: hoveredPolygonId },
            { hover: true }
          );

          // 弹出 tooltip，简单显示一下分级
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="popup-text">Grade: ${
                feature.properties.grade || "N/A"
              }</div>`
            )
            .addTo(map.current);
        }
      });

      // 鼠标离开 polygon 时
      map.current.on("mouseleave", "boston-fill", () => {
        map.current.getCanvas().style.cursor = "";

        if (hoveredPolygonId !== null) {
          map.current.setFeatureState(
            { source: "boston-zones", id: hoveredPolygonId },
            { hover: false }
          );
        }

        hoveredPolygonId = null;
        popup.remove();
      });

      // 点击 polygon 时：选中，并且 fitBounds
      map.current.on("click", "boston-fill", (e) => {
        if (!e.features || e.features.length === 0) return;

        const feature = e.features[0];
        setSelectedFeature(feature.properties);

        // 把点击的多边形 bounds 算出来
        const bounds = new mapboxgl.LngLatBounds();

        // 先看 geometry 是 Polygon 还是 MultiPolygon，来决定如何遍历坐标
        const geomType = feature.geometry.type;
        const coords = feature.geometry.coordinates;

        if (geomType === "Polygon") {
          // coords: [ [ [lng, lat], [lng, lat], ... ] ]
          coords[0].forEach((coord) => bounds.extend(coord));
        } else if (geomType === "MultiPolygon") {
          // coords: [ [ [ [lng, lat], ... ], ... ], [ [ ... ] ] ]
          coords.forEach((polygon) => {
            polygon[0].forEach((coord) => bounds.extend(coord));
          });
        }

        map.current.fitBounds(bounds, {
          padding: 40,
          duration: 1000
        });
      });

      // 添加一个图例 DOM
      const legend = document.createElement("div");
      legend.innerHTML = `
        <div style="
          position: absolute;
          top: 20px;
          right: 20px;
          background: rgba(255, 255, 255, 0.8);
          padding: 10px;
          border-radius: 8px;
          font-family: sans-serif;
          font-size: 12px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        ">
          <strong>Legend: Grade Colors</strong><br/>
          <div><span style="display:inline-block;width:12px;height:12px;background:${
            gradeColors.A
          };margin-right:6px"></span> Grade A</div>
          <div><span style="display:inline-block;width:12px;height:12px;background:${
            gradeColors.B
          };margin-right:6px"></span> Grade B</div>
          <div><span style="display:inline-block;width:12px;height:12px;background:${
            gradeColors.C
          };margin-right:6px"></span> Grade C</div>
          <div><span style="display:inline-block;width:12px;height:12px;background:${
            gradeColors.D
          };margin-right:6px"></span> Grade D</div>
        </div>
      `;
      map.current.getContainer().appendChild(legend);
    });
  }, []);

  // 当 gradeFilter 改变时，或数据更新时，替换一下 source 数据
  useEffect(() => {
    if (!map.current || !map.current.getSource("boston-zones")) return;
    const newData = {
      type: "FeatureCollection",
      features: getFilteredFeatures()
    };
    map.current.getSource("boston-zones").setData(newData);
  }, [gradeFilter]);

  return (
    <>
      <style>
        {`
          .mapboxgl-popup.custom-popup {
            padding: 0;
          }
          .mapboxgl-popup.custom-popup .mapboxgl-popup-content {
            background: rgba(255,255,255,0.7);
            border-radius: 6px;
            padding: 4px 10px;
            font-family: sans-serif;
            font-size: 13px;
            font-weight: 600;
            color: #111;
            text-shadow: 0 0 2px white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
          }
          .mapboxgl-popup.custom-popup .mapboxgl-popup-tip {
            border-top-color: rgba(255,255,255,0.7);
          }
        `}
      </style>

      <div style={{ display: "flex", position: "relative" }}>
        {/* 侧边栏 */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: sidebarOpen ? 0 : "-340px",
            width: "320px",
            height: "100vh",
            background: "rgba(255, 255, 255, 0.2)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderRight: "1px solid rgba(255, 255, 255, 0.2)",
            padding: "24px 16px",
            boxSizing: "border-box",
            transition: "left 0.3s ease-in-out",
            zIndex: 2
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Filter by Grade</h3>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            style={{
              padding: "6px",
              borderRadius: "6px",
              border: "1px solid #ccc",
              width: "100%"
            }}
          >
            <option value="all">All</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>

          <hr style={{ margin: "16px 0" }} />

          {selectedFeature ? (
            <div>
              <h4 style={{ marginBottom: "4px" }}>Selected Zone</h4>
              <p>
                <strong>Grade:</strong> {selectedFeature.grade}
              </p>
              <p>
                <strong>Category:</strong>{" "}
                {selectedFeature.category || "N/A"}
              </p>
              <p>
                <strong>Avg. Income:</strong>{" "}
                {selectedFeature.Average_Income
                  ? `$${Number(selectedFeature.Average_Income).toLocaleString()}`
                  : "N/A"}
              </p>
            </div>
          ) : (
            <p style={{ color: "#777" }}>Click a zone to see details</p>
          )}
        </div>

        {/* 折叠侧边栏的按钮 */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            position: "absolute",
            top: "50%",
            left: sidebarOpen ? "320px" : "0px",
            transform: "translateY(-50%)",
            zIndex: 3,
            background: "rgba(255,255,255,0.4)",
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: "0 6px 6px 0",
            padding: "4px 8px",
            cursor: "pointer",
            fontSize: "16px",
            backdropFilter: "blur(6px)"
          }}
        >
          {sidebarOpen ? "◀" : "▶"}
        </button>

        {/* 地图容器 */}
        <div
          ref={mapContainer}
          style={{ width: "100%", height: "100vh" }}
        />
      </div>
    </>
  );
}
console.log("Inside component =>", redliningData);

export default MapView;
