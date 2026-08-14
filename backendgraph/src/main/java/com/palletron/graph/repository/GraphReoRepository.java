package com.palletron.graph.repository;

import com.palletron.graph.entity.GraphReo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface GraphReoRepository extends JpaRepository<GraphReo, Long> {
}
