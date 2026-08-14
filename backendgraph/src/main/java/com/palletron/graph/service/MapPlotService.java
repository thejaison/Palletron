package com.palletron.graph.service;

import com.palletron.graph.entity.GraphReo;
import com.palletron.graph.entity.MapPlot;
import com.palletron.graph.entity.PlotDetail;
import com.palletron.graph.repository.GraphReoRepository;
import com.palletron.graph.repository.MapPlotRepository;
import com.palletron.graph.repository.PlotDetailRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Service
public class MapPlotService {

    @Autowired
    private MapPlotRepository mapPlotRepository;

    @Autowired
    private PlotDetailRepository plotDetailRepository;

    @Autowired
    private GraphReoRepository graphReoRepository;

    private static final String CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    private final SecureRandom random = new SecureRandom();

    public String createPlot(String plotName) {
        String key = generateUniqueKey();
        MapPlot mapPlot = new MapPlot();
        mapPlot.setKeyId(key);
        mapPlot.setPlotName(plotName != null ? plotName : "Warehouse Plot");
        mapPlotRepository.save(mapPlot);
        return key;
    }

    private String generateUniqueKey() {
        String key;
        do {
            StringBuilder sb = new StringBuilder(6);
            for (int i = 0; i < 6; i++) {
                sb.append(CHARS.charAt(random.nextInt(CHARS.length())));
            }
            key = sb.toString();
        } while (mapPlotRepository.existsByKeyId(key));
        return key;
    }

    @Transactional
    public void saveDetails(String keyId, Integer loadingPoints, Integer unloadingPoints, String intersection,
            Integer noOfRobots) {
        MapPlot mapPlot = mapPlotRepository.findByKeyId(keyId)
                .orElseThrow(() -> new IllegalArgumentException("Plot not found for key: " + keyId));

        Optional<PlotDetail> existing = plotDetailRepository.findById(mapPlot.getId());
        PlotDetail detail = existing.orElse(new PlotDetail());
        detail.setPlotId(mapPlot.getId());
        detail.setKeyId(keyId);
        detail.setLoadingPoints(loadingPoints);
        detail.setUnloadingPoints(unloadingPoints);
        detail.setIntersection(intersection);
        detail.setNoOfRobots(noOfRobots);

        plotDetailRepository.save(detail);
    }

    @Transactional
    public void saveGraph(String keyId, String connections, String weights, String canvasData) {
        MapPlot mapPlot = mapPlotRepository.findByKeyId(keyId)
                .orElseThrow(() -> new IllegalArgumentException("Plot not found for key: " + keyId));

        Optional<GraphReo> existing = graphReoRepository.findById(mapPlot.getId());
        GraphReo graph = existing.orElse(new GraphReo());
        graph.setPlotId(mapPlot.getId());
        graph.setConnections(connections);
        graph.setWeights(weights);
        graph.setCanvasData(canvasData);

        graphReoRepository.save(graph);
    }

    public Map<String, Object> getPlotData(String keyId) {
        MapPlot mapPlot = mapPlotRepository.findByKeyId(keyId)
                .orElseThrow(() -> new IllegalArgumentException("Plot not found for key: " + keyId));

        Map<String, Object> result = new HashMap<>();
        result.put("id", mapPlot.getId());
        result.put("keyId", mapPlot.getKeyId());
        result.put("plotName", mapPlot.getPlotName());

        Optional<PlotDetail> detail = plotDetailRepository.findById(mapPlot.getId());
        if (detail.isPresent()) {
            result.put("loadingPoints", detail.get().getLoadingPoints());
            result.put("unloadingPoints", detail.get().getUnloadingPoints());
            result.put("intersection", detail.get().getIntersection());
            result.put("noOfRobots", detail.get().getNoOfRobots());
        }

        Optional<GraphReo> graph = graphReoRepository.findById(mapPlot.getId());
        if (graph.isPresent()) {
            result.put("connections", graph.get().getConnections());
            result.put("weights", graph.get().getWeights());
            result.put("canvasData", graph.get().getCanvasData());
        }

        return result;
    }
}
